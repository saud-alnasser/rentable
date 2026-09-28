---
status: resolved
---

# feat(organization): an older organization is upgraded by its owner

## Outcome

The human's call on the running application, 2026-09-26. The effort refused an organization made
by an earlier build and told the person to export each workspace there; an update replaces that
build and a refused organization cannot sign in, so nobody could reach an export. After this, the
owner's first sign-in or resume on this build upgrades a format 1 organization in place, as
[[efforts/838-permissions-are-a-role-and-an-override/plan]], *Migration*, gives it: every member
keeps their role and exactly what they could do, every row is re-signed from the root and verifies
on every machine, and the `format` row is written last. Until then any other member is told the
organization waits for its owner, and nothing is written.

## Acceptance Criteria

Traces requirement 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `ALTER TABLE ... ADD COLUMN` and `DROP COLUMN` are measured through the organization's sync
      connection before the upgrade relies on either; the result is recorded where the 2026-08-20
      drop-and-rename measurement is, and the member columns change by an approach that replicates.
- [x] A Rust test builds a format 1 organization in the main-branch shape (the old tables, `member.v2`
      rows, `certificate.v1` in `administrator_certificate`, the unsigned `revoked_at`) holding an
      owner, an administrator the owner narrowed, a member granted administration flags, a removed
      member, a pending invitation, a full-access and a read-only grant, and a mark; the owner signs
      in on the new build, and afterwards the organization reads as format 2 with the three built-in
      roles and no `administrator_certificate`.
- [x] In that test each member's effective permissions equal the plan's mapping: the old bits 0 to 6
      (`changeRole` as `assignRole` and `overrideMember`), every record flag with delete, and for an
      administrator `manageMark` and `manageRoles`; the owner's row is `owner` with no override; the
      member with administration flags is a `manager` holding exactly their flags; the removed
      member is removed and grants nothing.
- [x] In that test a second store on the same database, which never held the organization key,
      verifies every member, role, certificate, workspace, grant, invitation and mark row, and the
      administrator's and the member's signed acts afterwards verify there too.
- [x] An upgrade cut short before the `format` row is written leaves an organization that still
      reads as format 1, and the owner's next sign-in completes it.
- [x] The same format 1 organization opened first by a member (sign-in, resume, connect, join and a
      machine link) is refused with `OrganizationOlder`, saying it waits for its owner to open this
      version, in English and Arabic, and nothing is written.
- [x] The owner's resume (the remembered key, no password) and `setup::connect_existing` upgrade the
      same way the sign-in does.
- [x] An organization of `format` version 3 is still refused naming the update, and nothing is
      written.
- [x] Remembered sessions survive: `session_epoch` is kept on every row.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/store.rs` (`refuse_another_format`, `complete_schema`, `format`,
  `write_format`, the schema), `command.rs` (`open_replica`, sign-in, resume), `setup.rs`
  (`owner_key_from`, `connect_existing`, `create_organization`), `session.rs`
  (`sign_in_by_username`), `authority.rs`, `role.rs` (`repair_owner_row`), `connect.rs`, `join.rs`,
  `machine.rs`, `sync/store.rs`, `error.rs`
- `origin/main:apps/desktop/tauri/src/organization/` for the format 1 shapes and preimages
- `src/lib/i18n` (en and ar) for the refusal's wording
