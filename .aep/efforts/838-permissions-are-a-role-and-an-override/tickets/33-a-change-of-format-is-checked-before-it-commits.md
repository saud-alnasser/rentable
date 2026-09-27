---
status: resolved
blocked-by: [32]
---

# fix(organization): a change of format is checked before it commits

## Outcome

The owner's upgrade commits whatever its steps wrote. After this, inside the same transaction and
before it commits, the organization is checked by `schema.rs` (ticket 32): structure sound, and its
schema the one `install_schema` builds, with the tables the upgrade leaves alone named once as
allowed. A check that fails rolls the whole walk back and refuses with `ShapeNotAsBuilt`.

## Acceptance Criteria

Traces requirement 15 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `upgrade::walked` runs the check after the last change and the `format` row, inside the
      transaction. A test with a change that leaves a column behind finds the organization as it
      was and the refusal given.
- [x] The format 1 fixture upgraded passes the check. *0.14.0, 0.15.0 and main create `member`
      with the same statement and never alter it, so the fixture's shape is every real format 1
      organization's.*
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `store.rs` (`install_schema`), `tauri/src/schema.rs`
