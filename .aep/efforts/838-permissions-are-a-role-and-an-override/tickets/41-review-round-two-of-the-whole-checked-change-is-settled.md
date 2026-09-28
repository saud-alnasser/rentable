---
status: resolved
blocked-by: [38, 39, 40]
---

# fix(organization): review round two of the whole, checked change is settled

## Outcome

Review round two of tickets 38 to 40 found nothing blocking, and there is no third round. The
structural check cannot see a UNIQUE constraint, a foreign key or a partial index a rebuild loses;
a sync error whose text carries SQLite's not-a-database words can mark a healthy replica; the
earlier records drop a contract's link to a missing unit without a count; and a context, a module
doc, the plan and `rules/interface` say more or less than the code. After this, each is as the
criteria say.

## Acceptance Criteria

Traces requirement 15, requirement 17 and requirement 18 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The check compares every index a table has, SQLite's own included, by table, origin,
      uniqueness, partial or not and ordered columns, and each table's foreign keys. A test finds a
      lost inline UNIQUE, a lost REFERENCES and a lost partial predicate each a difference.
- [x] Text matching of the not-a-database words is kept to the open; push and pull mark a replica
      only on the engine's kinds. A test covers it.
- [x] The earlier records count contract links left out for a missing unit.
- [x] `contexts/desktop/remote-sync` and `database/corrupt.rs` say which reads are watched.
- [x] The plan's *Before Turso* note gives the way-in line as built, its Testing Strategy rows run
      in order, and its superseded note renders; `rules/interface`'s earlier-records exception
      sits after the 832 section's provenance with its own; `rules/testing`'s eighth property
      says whose call admitted it.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/schema.rs`, `database/corrupt.rs`, `earlier.rs`, `.aep/contexts/desktop/remote-sync.md`,
  the effort's `plan.md`, `.aep/rules/interface.md`, `.aep/rules/testing.md`
