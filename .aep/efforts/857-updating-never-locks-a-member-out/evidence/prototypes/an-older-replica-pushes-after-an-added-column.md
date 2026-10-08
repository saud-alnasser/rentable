---

---

# Hypothesis

A replica opened by an older build, one that never learns of a new column, can hold
captured, unpushed inserts and updates on a table and push them successfully after the
primary has gained (a) a new nullable column on that table, (b) a new
`NOT NULL DEFAULT 'x'` column on it, or (c) a new table. The rows land with `NULL` or the
default in the new column, and the replica then pulls the new shape without breaking its
later reads and writes that name only the old columns.

This holds in all three orders the effort cares about:

1. the older replica pushes before it pulls the DDL, which is what `replicate_engine` in
   `database/mod.rs` does, since it pushes first;
2. it pulls the DDL first and then pushes changes captured before it, the mixed column set;
3. after pulling the DDL, it makes new inserts and updates naming only the old columns, and
   pushes them.

# Falsifier

Any one of these refutes it, for the order and column kind where it is seen:

- a push or a pull errors, for instance with `Number of arguments mismatch`, the error
  `organization/store/format.rs` (`format_one_reshape`) records for a row change captured
  under a column that the same push later dropped;
- a row reaches the remote or the other replica with wrong values, or without `NULL` or the
  default in the new column;
- a later read or write on the older replica that names only the old columns fails.

# Experiment

A throwaway `#[ignore]`d test module, `database/proto857.rs`, in a detached worktree at
`.aep/worktrees/857-updating-never-locks-a-member-out/_prototype-push-after-added-column`
(effort branch tip `c49ec9be`). It went through the existing live scaffolding:
`LiveWorkspace::create` made one throwaway database per case in group `rentable` of org
`saud-alnasser` and minted a token for it, and `LiveWorkspace::replica` opened two replicas
through the app's own `Database::open_replica`, the same way the `losing_writer` tests do.
`destroy` deleted each database at the end of its case. The run was
`cargo test --lib proto857_all -- --test-threads=1 --ignored --nocapture`, with
`TURSO_GROUP=rentable RENTABLE_LIVE_TURSO=1`, and it took 75 s for all 12 cases.

There were 12 cases: 2 orders × 3 DDL kinds × 2 kinds of captured change (one `INSERT`, or
one `UPDATE`, kept apart so that a failure could be put down to one of them). Each case:

1. Over the pipeline: `CREATE TABLE pay (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, note TEXT)`
   and a seed row `('u1', 1, 'seed')`. Both replicas pull.
2. Replica A, the older build, captures without pushing either
   `INSERT INTO pay (id, amount, note) VALUES ('i1', 10, 'captured insert')` or
   `UPDATE pay SET amount = 20, note = 'captured update' WHERE id = 'u1'`.
3. The DDL is applied **over the pipeline** (`/v2/pipeline`, through the app's
   `OverThePipeline`) as `BEGIN; <ddl>; COMMIT`, which is how the shipped migration runner
   (`organization/lease/apply.rs`) reaches a workspace, rather than from a replica. The
   statement was one of `ALTER TABLE pay ADD COLUMN extra TEXT`,
   `ALTER TABLE pay ADD COLUMN extra TEXT NOT NULL DEFAULT 'x'`, or
   `CREATE TABLE fresh (id TEXT PRIMARY KEY, v TEXT)`. Replica B, the newer build, then
   pulls it.
4. For order 1, A runs push and then pull. For order 2, A runs pull, reads, and then pushes.
5. The remote is read over the pipeline. A reads `SELECT id, amount, note` and `SELECT *`,
   on its held connection and on a fresh one.
6. For order 3, A inserts `('i2', 30, ...)` and updates `u1` to `amount = 40`, naming old
   columns only, then pushes and pulls. The remote, B and A are all read again.

# Observation

**Not one error, in any of the 12 cases.** Every push answered `ok(())` and every pull
`ok(true)`. `Number of arguments mismatch` never appeared.

- **Order 1 (push before pull)**, nullable column: remote after the push read
  `[i1, 10, captured insert, NULL], [u1, 1, seed, NULL]` for the insert case and
  `[u1, 20, captured update, NULL]` for the update case. Default column: the same rows with
  `x` in `extra`, both for the pushed row and for the seed. New table: `pay` was unchanged,
  `fresh` was present, and the rows were exact.
- **Order 2 (pull with captured changes outstanding, then push)**: the pull replayed the
  local change over the new shape. Before the push, A already read
  `(i1, 10, captured insert, Null)` (nullable), `(..., Text("x"))` (default) and the update
  as `(u1, 20, captured update, x/Null)`. The push that followed succeeded, and the remote
  held the same values.
- **Order 3 (new writes naming only the old columns)**: the inserts and updates succeeded
  locally, pushed `ok`, and landed as `[i2, 30, ..., NULL|x]` and `[u1, 40, ..., NULL|x]`.
  B's final read was identical to A's and to the remote in every case.
- **Reads that name only the old columns kept working** on A's held connection and on a fresh
  one after it pulled the new column: `SELECT id, amount, note` returned three columns, and
  `SELECT *` returned four.
- **`INSERT` and `UPDATE` behaved the same.** Neither failed, and an update never cleared or
  overwrote the new column: the default `x` survived both the captured update and the later
  one.

Two things surprised me:

- A pull with unpushed local changes rebased them over the new column with no complaint,
  even though the change was captured as a three-column row. This is the mirror of the
  dropped-column failure in `format.rs`, which comes from a captured column the remote
  **no longer has**. A captured row **short** of the remote's columns is filled in, not
  refused.
- `SELECT count(*) FROM turso_cdc` stayed at 2 or 3 after a successful push, so the CDC
  table keeps its rows after they are pushed. It is not a count of what is still pending,
  and nothing should read it as one.

# Result

**Confirmed**, for all three orders, all three DDL kinds, and for both `INSERT` and `UPDATE`.
None of the falsifier's conditions was seen.

What this run does not cover:

- Both "builds" ran the same `turso` engine version (the one in `Cargo.lock` at `c49ec9be`).
  An older build that also has an older engine was not tested.
- The DDL went over the pipeline, not through a replica's change capture.
- A **dropped** or **renamed** column was not tested, and remains the known failing case in
  `format.rs`.

# Conclusion

Adding a nullable column, adding a `NOT NULL DEFAULT` column, or adding a table is a shape
change that an older replica survives in either order. Its outstanding changes push, they
land with `NULL` or the default, and it goes on reading and writing the old columns once it
has pulled the new shape. The effort can therefore treat additive migrations as safe to
apply while older builds are still running and still holding unpushed writes. That safety
has to be **kept** as a constraint: a migration that drops or renames a column breaks it,
because the old build's captured row changes still name that column.

# Disposition of the code

Deleted, along with the worktree and the `_tp` build directory. Nothing is promoted. The
12 throwaway databases (`t552-p857-*`) were each deleted by the run's teardown. Before and
after the run, the group's database list was the same 19 names, with no `t552-*` among them.
No existing database was read, written or deleted.
