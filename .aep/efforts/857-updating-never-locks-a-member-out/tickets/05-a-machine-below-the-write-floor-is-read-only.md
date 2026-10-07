---
status: open
blocked-by: [04]
---

# feat(database): a machine below the write floor is read-only

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `database/` and `api/context.ts`; Technical Risks*).

## Outcome

While this build stands below a workspace's or the organization's write floor, every create, edit and delete is refused in Rust where it reaches the engine and in the routers, with the version as the reason, and nothing is pushed; reads go on as before.

## Acceptance Criteria

Traces requirement 6 and criterion 6.

- [ ] The ticket first measures whether the turso engine honours `PRAGMA query_only`, records the answer in Notes, and enforces the refusal with it or, failing that, by classifying the statement with the engine's parser.
- [ ] `Database::execute_single_sql` and `execute_batch_sql` refuse every write while `ReadOnly` with `WorkspaceReadOnlyByVersion`; `replicate` pulls and does not push.
- [ ] Organization acts through `act::as_member` refuse with `OrganizationReadOnlyByVersion` while the organization is `ReadOnly`.
- [ ] `permissionsIn` folds the standing like a read-only grant, clearing `WRITE_FLAGS`, and `refusalOf` names the version; both reasons have Arabic and English sentences.
- [ ] Tests: Rust refuses each write kind and no push happens; a router test refuses create, edit and delete with the version reason; reads succeed.

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
