---
aep: 2.6.0
owner: repository
date: 2026-08-19
kind: research
---

# Question

Does a `turso` connection offer the transaction and batch semantics
`execute_batch_sql` relies on today — a set of statements that commits or leaves nothing
behind — and **is a transaction's writes captured and pushed as one unit**?

Asked because #565's Notes make it the prerequisite to building anything: `db_execute_batch_sql`
runs its batch inside an `sqlx` transaction and `db_execute_single_sql` explicitly refuses
`BEGIN`/`COMMIT`/`ROLLBACK`, so batching is the only transactional path this application has.
#536's whole-workspace import is one batch of roughly 6,500 statements, which makes the answer
load-bearing rather than academic.

# Sources

- `turso` **0.7.2** crate source, read 2026-08-19 from the local cargo registry
  (`~/.cargo/registry/src/index.crates.io-*/turso-0.7.2/`) — `src/lib.rs`, `src/connection.rs`,
  `src/transaction.rs`, `src/sync.rs`.
- `turso_sync_engine` **0.7.2** crate source, same registry, same day — `src/database_tape.rs`,
  `src/database_sync_engine.rs`, `src/database_replay_generator.rs`.

**Both are 0.7.2, and #565 mandates 0.8.0-pre.4.** That version is not in the local registry and
was not fetched. Everything below is true *of 0.7.2* and is a well-founded expectation of
0.8.0-pre.4 rather than an observation about it — see *Not checked*.

# Findings

**source — the connection has a batch call.** `Connection::execute_batch(&self, sql) -> Result<()>`
(`turso-0.7.2/src/connection.rs:130`). It calls `maybe_handle_dangling_tx()` and then
`prepare_execute_batch(sql)`.

**source — the connection has real transactions.** `turso::transaction::Transaction`
(`turso-0.7.2/src/transaction.rs`) issues `BEGIN DEFERRED`, `BEGIN IMMEDIATE` or
`BEGIN EXCLUSIVE` per `TransactionBehavior`, and exposes `commit()`. `DropBehavior` defaults to
`Rollback`, so a transaction dropped without an explicit commit rolls back. `Transaction::new`
takes `&mut Connection` to make nesting a compile error; `new_unchecked` takes `&Connection` and
fails at runtime if one is already open. `Connection::is_autocommit()` reports whether one is
open.

**interpretation — the semantics `execute_batch_sql` relies on are available.**
*Commits or leaves nothing behind* is what `Transaction` + default-rollback-on-drop gives, and it
is the same shape `sqlx`'s transaction gives today. The refusal of `BEGIN`/`COMMIT`/`ROLLBACK` in
`execute_single_sql` stays meaningful under it, because the transaction is owned by the caller
rather than typed in by one.

**observation — the CDC stream carries commit boundaries, and they are first-class.**
`DatabaseTapeOperation` has a `Commit` variant alongside `RowChange`, `StmtReplay` and
`SchemaReplay` (`turso_sync_engine-0.7.2/src/database_sync_engine.rs:1962–1967`). The tape
iterator tracks `in_txn` and `txn_boundary_returned` and emits `Commit` at the boundary
(`database_tape.rs:247, 276, 495–501`). The replay generator says of `DatabaseChangeType::Commit`:
*"COMMIT records are handled at the tape level, not here"*
(`database_replay_generator.rs:185–188`), and the logical apply path drives one explicitly —
`replay.replay(coro, DatabaseTapeOperation::Commit)` (`database_sync_engine.rs:2123`).

**observation — the tape's scan is bounded to exclude uncommitted change ids.**
`DatabaseTapeOpts::max_change_id_exclusive` exists because *"a concurrent MVCC transaction may
still commit below the current max"* (`database_tape.rs:421–424, 454–458`), so a reader does not
take a change id whose transaction has not landed.

**interpretation — a transaction is a unit in the change stream and not merely a set of rows.**
The boundary is represented, carried, and replayed, and the scan is bounded so a half-written
transaction is not read. That is the property #565's Notes ask about.

**conclusion — the question is answered in the affirmative for 0.7.2**, on both halves: the
transaction and batch semantics exist, and a transaction's changes are captured with a commit
boundary that the replay path honours.

# Not checked

- **0.8.0-pre.4, which is the version #565 mandates.** Not in the local registry and not fetched.
  The finding above is 0.7.2's. The 0.7.2 → 0.8.0-pre.4 change that mattered to decision 10 was a
  WAL-epoch durability fix (PR #8103), which is not obviously near this API — but *not obviously
  near* is inference, and the read is one `cargo add` away once #565 is being built.
- **Whether `execute_batch` itself opens a transaction.** `prepare_execute_batch` was not read;
  only the call site was. It matters because if it does not, the batch path must open one
  explicitly, and if it does, opening a second would be the nesting `Transaction::new` exists to
  prevent.
- **Push granularity in the non-MVCC path.** The commit boundary was traced through the *logical
  MVCC* apply path. Whether the ordinary push — which the earlier research established is WAL
  frame-based — preserves the same boundary was not established.
- **Behaviour at 6,500 statements.** Nothing here is a measurement. Whether one batch of that size
  is affordable in memory, in WAL growth, or in push size is unmeasured, and #536's import is the
  case that would find out.
- **Whether `PRAGMA capture_data_changes_conn` interacts with an open transaction** — for instance
  whether arming it inside one is honoured for that transaction's own writes.
