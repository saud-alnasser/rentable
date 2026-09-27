---
status: resolved
blocked-by: [32]
---

# test(organization): every shipped version is migrated in the tests

## Outcome

No test builds a workspace at an old version with rows and walks it forward. After this, one seeded
database per shipped workspace version is walked to the shipped version through `apply_between`
against a local stand-in for the pipeline, and compared with a fresh build's schema and the rows
expected; a shipped version without a seed fails; and `rules/migrations` is what a next migration
follows.

## Acceptance Criteria

Traces requirement 16 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] A seed per workspace version shipped from 0.14.0 on (schema 5 and after), each walked to the shipped version, schema and rows
      compared. *No carried version passes through `0003` since the human's call put the oldest at
      5; its drops and renames are the guided move's (requirement 18), not this walk's.*
- [x] A test fails a shipped version from 5 on without a seed.
- [x] The format 1 organization walked to format 2 is compared with a fresh build's schema.
      *Moved to ticket 33, whose check does it inside the upgrade: the reshaped `member` table is
      not a fresh one's, measured here and at 33.*
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/migrate.rs` tests, `tauri/migrations/`, `.aep/rules/migrations.md`
