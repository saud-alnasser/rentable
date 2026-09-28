---
status: resolved
blocked-by: [23]
---

# refactor(organization): the upgrade shares the store's readers and signers

## Outcome

Review of ticket 22, standards. The upgrade copies signing preimages, row readers and sign-in
helpers the store and session already have. Two copies of a preimage can drift apart without
failing to compile. It also threads a test-only cut-short variant through the release build. After
this there is one of each, and nothing compiled into production exists for a test alone.

## Acceptance Criteria

Traces requirement 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The upgrade builds workspace, grant, invitation and mark authorities with the store's own
      helpers, and no copy of a signing preimage remains in the upgrade.
- [x] The format 1 directory reader shares one unverified reader per table with the `signed_*`
      readers. The column lists and row mapping are written once.
- [x] The upgrade reuses the session's username opener and content-key opener, and no copy remains.
- [x] Nothing in the release build exists only so a test can cut the upgrade short. The cut-short
      test drives the writes before `format` and fails the transaction itself.
- [x] Every doc comment in the upgrade says what its code does, including the remembered-key path.
      Every function has one. The places that name where the upgrade runs all name sign-in, resume
      and connect.
- [x] A dropped row is named by a typed value, not a table string and a joined id.
- [x] The upgrade's standing type is private and does not reuse the name `role::Standing`, and the
      record flag set sits in `permission.rs` beside the other flag sets.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `store.rs` (`workspace_authority`, `grant_authority`,
  `invitation_authority`, `mark_authority`, the `signed_*` readers, `format_one_directory`),
  `session.rs` (`opened`, `content_key_of`), `permission.rs`, `forget.rs`
