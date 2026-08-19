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
- **`turso` and `turso_sync_engine` 0.8.0-pre.4**, added to `apps/desktop/tauri/Cargo.toml` and
  read the same day, building #565 — `src/connection.rs`, `src/transaction.rs`, `src/rows.rs`,
  `src/value.rs`, `src/params.rs`, `src/sync.rs`, and `database_tape.rs` /
  `database_sync_engine.rs` in the engine crate. Compiled and executed, not only read: the two
  tests in `apps/desktop/tauri/src/database/proxy.rs` run against a real engine.

*Written first against 0.7.2 alone, because the version #565 mandates was not in the registry.
The second reading is what closed that, and the corrections it forced are marked below.*

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

**conclusion — the question is answered in the affirmative**, on both halves: the transaction and
batch semantics exist, and a transaction's changes are captured with a commit boundary that the
replay path honours. *Reached from 0.7.2 and since confirmed at 0.8.0-pre.4, where the API above
is unchanged.*

# What 0.8.0-pre.4 changed about the answer *(2026-08-19, building #565)*

**source — `execute_batch` opens no transaction, and the name is the trap.**
`Connection::execute_batch(&self, sql)` calls `prepare_execute_batch`, which loops
`conn.prepare_first(sql)` and executes each statement it splits out, one at a time, with no
`BEGIN` anywhere (`turso-0.8.0-pre.4/src/connection.rs:130, 162-175`). It also takes one string
and binds nothing. **This corrects the expectation the first reading left open** — the batch
transport opens its own `Transaction` rather than reaching for the call whose name matches.

**source — a transaction that is dropped does not roll back when it is dropped.** `Drop` stores
the drop behaviour in `Connection::dangling_tx`, and the rollback is performed by
`maybe_handle_dangling_tx()` on the connection's **next use**
(`transaction.rs:222-235`, `connection.rs`). On a connection shared between requests the next use
is another request, which would then pay for this one — so the batch path rolls back explicitly
rather than leaving it to the drop.

**source — the engine arms change capture itself, on every connection it hands out.**
`DatabaseTape::connect` issues `PRAGMA capture_data_changes_conn('full,turso_cdc')` for each new
connection (`turso_sync_engine-0.8.0-pre.4/src/database_tape.rs:33, 156, 172-186`), and
`DatabaseSyncEngine::connect_rw` — which `sync::Database::connect()` reaches through the sdk kit
— is `main_tape.connect(coro)` (`database_sync_engine.rs:3175-3183`). **This reframes the fourth
gap rather than answering it as asked**: a caller never arms the pragma, so how arming it inside
an open transaction behaves is not a question this application can reach. What matters is the
consequence already in the constraints — a connection obtained any other way is one whose writes
cannot be pushed.

**observation — a row carries its storage class as a value, not as a type name.**
`Row::get_value(idx)` answers with `turso::Value`, a five-variant enum over exactly the classes
SQLite defines (`rows.rs:76-96`, `value.rs:5-12`). The declared column type is not reachable from
it. That makes the three properties `proxy.rs`'s `value_at` maintains by hand — storage class not
declared type, null matched first, no silent fallback — structural on this side rather than
maintained.

**observation — an engine built with no remote URL is a usable local database.**
`sync::Builder::build()` passes `remote_url: None` straight through
(`sync.rs:348-370`), and with `bootstrap_if_empty(false)` the result opens, accepts DDL, accepts
writes, and answers queries with no network involved. Observed by running it: both tests in
`proxy.rs` are built on exactly that engine.

# Not checked

*Three of the five entries this section opened with are closed above. What is left is what a
second reading of the crate cannot answer.*

- **Push granularity in the non-MVCC path.** The commit boundary was traced through the *logical
  MVCC* apply path. Whether the ordinary push — which the earlier research established is WAL
  frame-based — preserves the same boundary was not established, at either version.
- **Behaviour at 6,500 statements.** Nothing here is a measurement. Whether one batch of that size
  is affordable in memory, in WAL growth, or in push size is unmeasured, and #536's import is the
  case that would find out. The rollback test proves the batch is *one unit*; it proves nothing
  about what one unit of that size costs.
- **Any of it against a live remote.** Every observation above is of an engine with no remote URL.
  Push, pull, rotation and conflict through this API are acceptance criterion 9's, and they need
  a workspace the control plane minted.
