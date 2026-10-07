---
status: open
---

# refactor(upgrade): every step declares its kind and floors

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Architecture; Components, `upgrade/step.rs` and `upgrade/floor.rs`; Migration*).

## Outcome

Every shipped workspace migration and organization format step is declared in `upgrade/step.rs` as an addition or an upgrade with its floors, `upgrade/floor.rs` gives this build's standing against any database's floors, and data from before this effort reads as having floors equal to its version without anything being written.

## Acceptance Criteria

Traces requirement 2, requirement 13, criterion 2 and criterion 13.

- [ ] `WORKSPACE_STEPS` has one entry per embedded migration and `FORMAT_STEPS` one per transition; a test fails when a migration file or transition has none.
- [ ] Every step declared an addition passes `addition_sql_is_additive` (only `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE ... ADD COLUMN` that is nullable or has a default); a test proves a `DROP`, a `RENAME`, and a `NOT NULL` column without a default each fail it.
- [ ] Shipped steps are declared as the plan's Migration says: upgrade steps with floors equal to their own number; `0006` and format 3 as their meaning requires.
- [ ] `Floors::standing(known)` returns `Writable`, `ReadOnly` and `Unreadable` below, at and above each floor, in a table test.
- [ ] A database with no floor record reads `{ level, read, write }` equal to its current version (workspace `schema_version`, organization `format`) and the read writes nothing.
- [ ] [[rules/migrations]] gains the section the plan's Integration names.

## Relevant areas

- apps/desktop/tauri/src/upgrade/ (new `step.rs`, `floor.rs`)
- apps/desktop/tauri/build.rs (`WORKSPACE_MIGRATIONS`), `organization/lease/apply.rs` (`shipped_version`)
- apps/desktop/tauri/src/upgrade/format/mod.rs (`TRANSITIONS`)
- .aep/rules/migrations.md

## Constraints

- No behaviour changes in this ticket: nothing reads the verdict yet, and the existing refusals stay as they are until ticket 04.
- Shipped migration files are not edited ([[rules/migrations]]).
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
