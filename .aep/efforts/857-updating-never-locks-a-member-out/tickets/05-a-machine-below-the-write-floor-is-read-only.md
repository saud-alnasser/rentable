---
status: resolved
blocked-by: [04]
---

# feat(database): a machine below the write floor is read-only

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `database/` and `api/context.ts`; Technical Risks*).

## Outcome

While this build stands below a workspace's or the organization's write floor, every create, edit and delete is refused in Rust where it reaches the engine and in the routers, with the version as the reason, and nothing is pushed; reads go on as before.

## Acceptance Criteria

Traces requirement 6 and criterion 6.

- [x] The ticket first measures whether the turso engine honours `PRAGMA query_only`, records the answer in Notes, and enforces the refusal with it or, failing that, by classifying the statement with the engine's parser.
- [x] `Database::execute_single_sql` and `execute_batch_sql` refuse every write while `ReadOnly` with `WorkspaceReadOnlyByVersion`; `replicate` pulls and does not push.
- [x] Organization acts through `act::as_member` refuse with `OrganizationReadOnlyByVersion` while the organization is `ReadOnly`.
- [x] `permissionsIn` folds the standing like a read-only grant, clearing `WRITE_FLAGS`, and `refusalOf` names the version; both reasons have Arabic and English sentences.
- [x] Tests: Rust refuses each write kind and no push happens; a router test refuses create, edit and delete with the version reason; reads succeed.

## Relevant areas

- apps/desktop/tauri/src/database/mod.rs, proxy.rs
- apps/desktop/tauri/src/organization/act.rs
- apps/desktop/tauri/src/error.rs, apps/desktop/src/lib/error/tauri.ts
- apps/desktop/src/lib/api/context.ts, apps/desktop/src/lib/permission/permission.ts
- apps/desktop/src/lib/organization/i18n/

## Constraints

- `contract.reconcile` writes after a pull; it must be refused or skipped while read-only, not fail loudly.
- The read-only notice is ticket 12.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.

## Notes

- **`PRAGMA query_only` is honoured, measured first (2026-10-07)** on a workspace replica's own
  connection (`turso` as locked, `turso_core` 0.8.2): with it on, `INSERT`, `UPDATE`, `DELETE`,
  `CREATE TABLE` and `DROP TABLE` each answer `Parse error: Cannot execute write statement in
  query_only mode` and change nothing; a `SELECT` answers as before; a batch of reads inside a
  transaction runs; `PRAGMA query_only = 0` lets the next write through on the same connection.
  The pragma is a field of each connection (`Connection::query_only`, default false), so the sync
  engine's own connections, which apply a pull, are untouched. So the refusal is enforced with it,
  not by classifying statements; `database::floor::hold_writes` sets it on every checkout and
  `the_engine_refuses_every_write_under_query_only_and_reads_on` keeps the measurement as a test.
- Measured against the scripted server: a push is `POST /v2/pipeline` and a pull
  `POST /pull-updates`; the push test asserts on those targets.
- The organization's connection is held to reading only for the length of one `as_member` act and
  released after it, because an organization waiting for its owner is `ReadOnly` by the same
  verdict and the owner's upgrade writes through that connection.
- The frontend folds only a verdict on the workspace open (`readOnlyByVersionIn`); a verdict on the
  organization is the shell's refusal of the organization's acts, which crosses as
  `host.organizationReadOnlyByVersion` with its sentence.
- `contract.reconcile` is skipped while the identity is read-only by version, so a launch and a
  heartbeat do not fail on it; the owner's credential renewal (`workspace_renew_due`) is skipped
  while the organization is not writable, since it mints at Turso before writing.
- No changeset: nothing here is observable until a floor can be raised (ticket 07), and the notice
  a person sees is ticket 12's.
