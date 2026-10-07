---

---

# Hypothesis

When two offline replicas write the same value into a column that carries a UNIQUE index
(`tenant.phone`, `tenant.national_id`, `complex.name`, `contract.gov_id`), the engine refuses the
second writer's change, and a later push or pull drops that change without a word. Two fixes are
on the table:

- **(a)** hold the replica at the refusal, read the clashing rows out of its own database, discard
  the replica, pull again, and add the rows back once the person corrects them;
- **(b)** drop the four UNIQUE indexes as an upgrade step, check uniqueness in the app, and flag
  the duplicates that two offline machines make for merging.

(a) needs the rows to still be readable after the refusal, and re-adding them to work. (b) needs
duplicates to sync cleanly once the index is gone, and needs replicas that have not pulled the drop
to come along.

# Falsifier

- For (a): after the first refusal, B cannot read its unsent rows, or re-adding them after a
  discard and a fresh pull fails.
- For (b): with the index dropped on the primary, any push or pull fails, a row is lost, or a
  replica that still has the index locally fails its pull.

# Experiment

A throwaway `#[ignore]`d module, `database/proto_unique.rs`, in the detached worktree
`.aep/worktrees/857-updating-never-locks-a-member-out/_prototype` at the effort tip `aed3e0a3`.
It was never committed, and it was reverted afterwards. It used the existing live scaffolding:

- `LiveWorkspace::create` made one throwaway database per case in group `rentable`, named
  `t552-pu-*`;
- `apply_schema_remotely(shipped_migration_count())` put the full shipped schema (all 7
  migrations) on it over the pipeline;
- `LiveWorkspace::replica_in` opened each replica through the app's own `Database::open_replica`;
- `destroy` deleted each database after its case, inside a `tokio::spawn` wrapper so that a
  panic could not skip it.

The probe called the raw engine (`turso::sync::Database::push` and `pull`, `turso` 0.8.2 /
`turso_core` 0.8.2) rather than the app's `replicate`, so that each call's own return value is
what is quoted below. Remote state was read over the pipeline with `over_the_wire`.

The run was `cargo test --lib proto_unique_all -- --ignored --nocapture --test-threads=1`, with
`RENTABLE_LIVE_TURSO=1` and the credentials loaded from `apps/desktop/.env` into the environment.
Six cases ran, in 52 s and 19 s (case `q4` was re-run after a quoting bug in the probe).

Fixtures:

- A inserts tenant `tA`, phone `0500`.
- B inserts tenant `tB`, phone `0500`, and contract `cB` with `tenant_id = 'tB'`.
- Both write offline, and A pushes first.

The engine's own code was also read, in `turso_sync_engine-0.8.2` and `turso-0.8.2/src/sync.rs`.

# Observation

## 1. Baseline

**B pushes first** (case `q1push`):

```
A push -> Ok(())
B push#1 push -> Err(Error("sync engine operation failed: database sync engine error: failed to execute sql: Error { message: \"SQLite error: UNIQUE constraint failed: tenant.phone\", code: \"SQLITE_CONSTRAINT\" }"))
REMOTE tenant -> [["tA", "0500", "from A"]]
REMOTE contract -> [["cB", "gov-B", "tB"]]
B push#2 push -> Ok(())
B stats -> cdc_operations: 0
B pull#1 pull -> Ok(true)
B after pull#1 tenant -> [["tA","0500","from A"]]
B after pull#1 contract -> [["cB","gov-B","tB"]]
```

**B pulls first** (case `q1pull`):

```
B pull#1 pull -> Err(Error("sync engine operation failed: database sync engine error: failed to replay local change after remote apply: database error: UNIQUE constraint failed: tenant.phone"))
B after pull#1 tenant -> [["tB","0500","from B"]]   (local DB unchanged, cdc_operations: 2)
B pull#2 pull -> Err(... same words ...)
B push#1 push -> Err(... UNIQUE constraint failed: tenant.phone ..., code: "SQLITE_CONSTRAINT")
REMOTE contract -> [["cB","gov-B","tB"]]
B push#2 push -> Ok(())
B pull#3 pull -> Ok(true)
B after pull#3 tenant -> [["tA","0500","from A"]]; contract -> [["cB","gov-B","tB"]]
```

The ending is the same in both orders:

- B holds **A's tenant only**. B's tenant is gone everywhere.
- **B's contract was not lost: it landed on the remote with the refused push**, in the same
  batch. It now points at `tB`, which exists nowhere. A, B and the remote all hold
  `cB -> tB`, an orphan.
- The first push is the only call that fails. A pull before it fails and changes nothing, every
  time it is tried.

**Why the second push answers `Ok`** (from reading the code):

- The push sends `BEGIN IMMEDIATE`, each change, an upsert of the remote's
  `turso_sync_last_change_id`, and `COMMIT` as one pipeline batch. Every step after `BEGIN` runs
  on the condition "not in autocommit" (`database_sync_operations.rs` around 3012-3198).
- A UNIQUE failure aborts only its own statement. The transaction stays open, so the contract
  insert, the cursor upsert and the `COMMIT` all run.
- The client then sees the step error and skips its local meta update. The **remote** cursor has
  already moved past the refused change.
- The next push reads that cursor from the remote (`fetch_last_change_id`), so it finds nothing
  left to send and answers `Ok`.

## 2. Can B see what it is about to lose?

**Yes, fully, from its own database, until the second push or a successful pull.** After the
refusal and before anything else:

```
B after push#1 tenant -> [["tB","0500","from B"]]
B after push#1 contract -> [["cB","gov-B","tB"]]
B stats -> cdc_operations: 2
B `SELECT change_id, change_type, table_name, id FROM turso_cdc` -> [[1,0,"turso_sync_last_change_id",1],[2,2,null,null],[3,1,"tenant",1],[4,2,null,null],[5,1,"contract",1],[6,2,null,null]]
B `SELECT change_id, table_name, bin_record_json_object(table_columns_json_array(table_name), after) FROM turso_cdc WHERE table_name IN ('tenant','contract')` ->
  [3, "tenant", {"id":"tB","national_id":"nid-tB","name":"from B","phone":"0500"}]
  [5, "contract", {"id":"cB","gov_id":"gov-B",...,"tenant_id":"tB"}]
```

What the engine exposes:

- The change log is the ordinary table `turso_cdc` in the main database. Every engine connection
  turns on `PRAGMA capture_data_changes_conn('full,turso_cdc')`.
- `before` and `after` decode in SQL with `bin_record_json_object(table_columns_json_array(t), after)`.
- `<db>-changes` holds pulled remote changes, not local ones. `-info` holds the meta.
- The only API is `stats().cdc_operations`. It counts against a local hint that the refused push
  did not move, so it stays at 2 after the refusal, and drops to 0 at the push that discards.
- There is no pending-changes, discard or rollback API.
- The `turso_cdc` rows outlive the second push, so they do not tell what is still pending.

**Capture, discard and re-add** (case `q2`):

```
captured tenant -> Ok([["tB","nid-tB","from B","0500"]])
captured contract -> Ok([["cB","gov-B","tB"]])
(replica directory removed, opened again)
B fresh pull -> Ok(true); tenant -> [["tA",...]]; contract -> [["cB","gov-B","tB"]]
B exec INSERT tenant tB phone '0599' -> ok(1)
B exec INSERT contract cB ... -> ERR UNIQUE constraint failed: contract.id
B re-add push -> Ok(())
REMOTE tenant -> [["tA","0500","from A"], ["tB","0599","from B"]]
```

Capture and re-add work. **The re-add must expect partial landing**: the refused batch had
already put `cB` on the remote, so re-inserting it clashed on `contract.id`. It has to be an
upsert, or a diff against what the fresh pull holds.

## 3. Without the shared rule (case `q3`)

`DROP INDEX IF EXISTS tenant_phone_unique` was run over the pipeline, and both replicas pulled:

```
A/B indexes on tenant -> ["sqlite_autoindex_tenant_1","tenant_id_unique","tenant_national_id_unique"]
A push -> Ok(()); B push#1 push -> Ok(()); B pull -> Ok(true); A pull -> Ok(true); A push -> Ok(()); B push -> Ok(())
A, B and REMOTE tenant -> [["tA","0500","from A"], ["tB","0500","from B"]]
A, B and REMOTE contract -> [["cB","gov-B","tB"]]
cdc_operations: 0 on both
```

Both rows landed, every push and pull succeeded, and B's contract kept its tenant.

## 4. Mixed versions (cases `q4`, `q4b`)

The remote holds `t0` at `0500`. C1 (clean) and C2 pull and hold the index. C2 writes `tC` at
`0577` and does not send it. The primary then drops the index and inserts `t1` at `0500` and
`tR` at `0577`.

```
C1 pull -> Ok(true); C1 indexes -> [... no tenant_phone_unique]; tenant -> t0 0500, t1 0500, tR 0577
C2 pull pull -> Ok(true); C2 indexes -> [... no tenant_phone_unique]; tenant -> t0, t1, tC 0577, tR 0577; cdc_operations: 1
C2 push -> Ok(()); REMOTE tenant -> t0, t1, tC, tR
q4b, C pushes its pending tC 0577 before pulling the drop: C push -> Ok(()); C pull -> Ok(true); nothing lost
```

- A replica that has not pulled the drop does not fail. Its pull replaces the pages, so the index
  goes with them.
- Its pending change is replayed after the index is gone, in either order, and nothing is lost.
- **A replica's schema follows the primary's `DROP INDEX` on pull.** The pull is physical:
  `/pull-updates` pages are written as WAL frames, so `sqlite_master` follows the remote.

## 5. Can the app intercept the conflict?

- The first push's error names the constraint (`tenant.phone`) but not the row.
- The row can be found locally by decoding `turso_cdc` above the last pushed change, or by
  looking up the local rows with that value.
- That first error is the only signal. Nothing the engine answers afterwards says a change was
  dropped.

# Result

The hypothesis is confirmed, and the measurement corrects two parts of it.

**The loss is partial, not total.**

- The refused row is dropped.
- Changes in the same batch that the remote could take, such as B's contract, land anyway.
- The workspace is left with a contract whose tenant exists nowhere.

**Each fix's requirement:**

- (a) is possible. The rows are readable after the first refusal, and a re-add after a fresh
  pull works.
- (b) works with no failure anywhere. That covers both replicas offline, a replica that has not
  pulled the drop, and either push/pull order.

# Conclusion

Recommend **(b)**.

**Under (a), part of the loss has already happened by the time the app learns of it.**

- The refusal arrives after the same batch has committed the change's dependants (the orphan
  `cB -> tB`) and moved the remote cursor.
- The app can restore the tenant, but it is repairing a workspace that every other member has
  already pulled in a broken state.
- Its re-add must reconcile against partially landed rows. The plain re-insert failed on
  `contract.id`.
- It holds the replica until a person acts, and it depends on engine internals that are not an
  API: the remote cursor, `turso_cdc`, and `bin_record_json_object`.

**Under (b), there is no refusal for the engine to mishandle, so nothing is lost.**

- The drop propagates to every replica on its next pull, even one that never pulled before,
  with pending changes, in either order.
- Duplicates become ordinary rows that the app can flag for merging.

What this rules out:

- Relying on the engine to keep, retry or report a refused change. It does none of these.
- Treating the refused push as atomic. It is not.
- Fearing that a replica still holding the index will block on the new duplicates. It does not.

What it does not cover:

- Only `tenant_phone_unique` was dropped. The other three are the same mechanism and were not run.
- Uniqueness of the `id` columns (`*_id_unique`, primary keys) stays, and it is not a
  user-typed value.
- (b) still needs `schema.ts` to stop declaring `.unique()` on the four columns, so that no later
  generated migration puts the indexes back.
- (b) also needs the app's own uniqueness check, which was not built here.

# Disposition of the code

- Reverted with `git checkout -- .` in `_prototype`, and the `_t_proto` build directory was
  deleted. Nothing was promoted.
- The six throwaway databases (`t552-pu-*`) were each deleted by the run's teardown.
- The group's database list was the same 20 names before and after the run, with no `t552-*`
  among them.
- No existing database was read, written or deleted.
