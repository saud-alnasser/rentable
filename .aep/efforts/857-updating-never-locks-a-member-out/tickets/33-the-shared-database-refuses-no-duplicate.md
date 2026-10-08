---
status: resolved
---

# fix(database): the shared database refuses no duplicate

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Workspace step `0007` drops the four user-field unique indexes, declared as a step that moves no floor and so runs on its own on any machine that opens the workspace; `schema.ts` stops declaring them; no push is ever refused for a duplicate again.

## Acceptance Criteria

Traces requirement 14, requirement 1, requirement 2, criterion 14 and criterion 1.

- [x] Migration `0007` drops `tenant_phone_unique`, `tenant_national_id_unique`, `complex_name_unique` and `contract_gov_id_unique`; `schema.ts` no longer declares `.unique()` on the four columns, and regenerating migrations produces no change.
- [x] `0007` is declared in `database/step.rs` as a step that moves no floor, and the addition check admits `DROP INDEX` as a relaxation while still refusing every other removal; the declaration tests and the migrations rule say so.
- [x] Opening a workspace at 7 on this build, as a member, applies `0007` without the upgrade permission, records it in `applied_step`, leaves both floors and both legacy numbers unchanged, and the fresh-database shape check passes; a test.
- [x] A live test on throwaway databases: two replicas offline insert a tenant with the same phone, each with a contract on it; after both sync, in either order, every replica and the remote hold both tenants and both contracts, and no push is refused; a replica that has not yet pulled `0007` also syncs.

## Relevant areas

- apps/desktop/tauri/migrations/, apps/desktop/src/lib/platform/database/schema.ts
- apps/desktop/tauri/src/database/step.rs, organization/lease/
- .aep/rules/migrations.md

## Constraints

- Live tests touch only throwaway databases the test creates and deletes in the Turso group `rentable`; no existing database is read or written; the group is listed before and after.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
