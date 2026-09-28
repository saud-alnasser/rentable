---
status: resolved
---

# fix(organization): a workspace migration commits whole, checked, with its version inside

## Outcome

The research found the workspace tail sent as autocommitted statements, so a failure part way
leaves a workspace at no version and a retry replays what already ran, and the version kept in a
different database from the schema. After this, the tail, a check of the result and a version row
in the workspace commit in one transaction or not at all, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Whole, checked, tested
from every version, and rebuilt*, gives it, and the check is one function the organization's
change of format uses too (ticket 33).

## Acceptance Criteria

Traces requirement 15 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `apply_between` runs `BEGIN`, the version read, the tail, the check and the version row on one
      baton-held stream, then `COMMIT`, and `ROLLBACK` on any failure. A test fails a middle
      statement and finds every table as it was and the retry applying the whole tail.
- [x] The workspace keeps its version in a one-row table; where it already says the shipped version
      nothing is applied and only the organization's record is brought up. A test covers it.
- [x] `tauri/src/schema.rs` holds the check: `quick_check`, `foreign_key_check`, and the schema
      compared with a fresh database's of that version. A mismatch refuses with `ShapeNotAsBuilt`
      in English and Arabic, rolled back. A test covers it.
- [x] An `#[ignore]`d live test applies every shipped migration inside one explicit transaction on
      a real Turso database, for the human to run.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/migrate.rs`, `migration.rs`, new `tauri/src/schema.rs`, `error.rs`,
  `database/test/workspace.rs`; `src/lib/error/tauri.ts`, `src/lib/i18n`
