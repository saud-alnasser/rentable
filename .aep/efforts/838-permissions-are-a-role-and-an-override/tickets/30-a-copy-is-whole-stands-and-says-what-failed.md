---
status: resolved
blocked-by: [28]
---

# fix(organization): a copy is whole, stands, and says what failed

## Outcome

Review round one of tickets 26 to 28, the copy. A copy is not yet what requirement 13 asks. Its
row check compares the file with the rows the copy itself inserted, never with the source, so a
short read passes as complete. It keeps tables only, so a database restored from it loses the
workspace's unique indexes. A workspace is read one table per request with no transaction, so a
write between two reads makes a copy of no moment that existed, and one table too large for one
response would refuse every migration for good. Retention can remove the copy it just wrote.
Every failure says the folder could not be written, a dropped connection included. And the copy
on the account is named `org-...` in the owner's group, which `setup::held_organization_id` reads
as an organization and may offer to connect. After this, each of these holds as the criteria say.

## Acceptance Criteria

Traces requirement 13 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] Each table's rows in the copy are compared with the source's own `COUNT(*)`, read in the
      same snapshot as the rows. A test with a source answering fewer rows than it counts refuses.
- [x] The copy holds every index, view and trigger the source's schema holds, created after the
      rows, and leaves out only what the engine owns; what is left out is named in one place, and
      `OrganizationStore::tables` uses it rather than a second copy of the filter. A test finds a
      unique index in the copy.
- [x] A workspace is read as one snapshot, in one transaction over the pipeline, and in bounded
      pages, so no one response holds a whole table. A test pages a table larger than one page.
- [x] Retention never removes the copy just written. A test with three newer copies keeps it.
- [x] A copy that failed to read its source and one that failed to write are told apart in the
      log; the reader's sentence covers both ("check the connection and that the backups folder
      can be written"), says "nothing was changed" as its siblings do, in English and Arabic.
- [x] A copy on the account is named so no reader of the account's databases takes it for an
      organization or a workspace, and short enough that its hostname label stays within 63
      characters with the account's slug; `setup::held_organization_id`'s comment says so. A test
      covers the name.
- [x] `.aep/references/turso.md` records the seeded create, its source, and that copies count
      against the account's database quota and are removed only by the owner. `update.rs`'s
      history of the retired snapshot points at `backup.rs`. The changeset says a member's
      machine copies a workspace locally only. `migrate.rs`'s `unreadable` has its doc comment.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/backup.rs`, `organization/migrate.rs`, `organization/store.rs` (`tables`),
  `organization/setup.rs` (`held_organization_id`), `update.rs`, `sync/turso/platform.rs`
- `src/lib/i18n` (en and ar), `.changeset/an-organization-holds-roles.md`,
  `.aep/references/turso.md`
