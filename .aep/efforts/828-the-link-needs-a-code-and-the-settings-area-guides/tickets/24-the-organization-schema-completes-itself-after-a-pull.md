---
status: resolved
---

# fix(organization): the organization schema completes itself after a pull

## Outcome

A machine that pulls an organization made by an earlier build creates, through the sync
connection, every table the schema names that the replica lacks, and pushes it, so the
organization on Turso gains the table for everybody and no launch fails on a table this build
knows and the organization does not. A replica holding every table writes nothing.

## Acceptance Criteria

Traces requirements 14, 15 and 22 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criterion 12.
Cut 2026-09-16 from the human's test: their organization, made by a build before ticket 22,
answered `no such table: succession` at every launch, because the schema is issued once on the
machine that creates the organization and every other machine receives it as pages; a table
added later reached nobody. Ticket 22's builder raised it and the orchestrator dismissed it on
the assumption that the schema runs on every open; it does not.

- [x] `OrganizationStore::pulled` completes the schema after a successful pull through
      `complete_schema`, which reads the tables the replica holds and executes the `CREATE TABLE
      IF NOT EXISTS` of each one `TABLES` names that is absent, answering whether any was, and
      pushes where one was; a test opens a replica holding the first nine statements, finds the
      tenth created and reported, and a second completion reporting nothing.
      *Verified 2026-09-16 on the effort branch: `OrganizationStore::pulled` calls
      `complete_schema` after a successful pull and pushes where a table was created;
      `complete_schema` reads `tables()` and executes the `CREATE TABLE IF NOT EXISTS` of each
      name in `TABLES` that is absent;
      `a_replica_lacking_a_table_the_schema_names_gains_it_and_says_so` opens a replica
      holding the first nine statements, finds the tenth created and reported, and a second
      completion reporting nothing.*
- [x] `cargo test`, `cargo fmt --check`, `pnpm check`, `pnpm lint` and `pnpm test` pass; the
      plan's *Migration* says the schema completes after a pull.
      *Verified in the run's worktree: `cargo test -- --test-threads=1`: `401 passed; 0
      failed; 10 ignored`; `cargo fmt --check` prints nothing; `pnpm check` exit 0 (desktop
      `9312 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0; the plan's
      Migration carries the dated correction.*

## Relevant areas

`apps/desktop/tauri/src/organization/store.rs`, the plan's *Migration*.

## Constraints

- **Not on open**: a fresh connect opens an empty replica before its first pull, and creating
  tables there would collide with the pages the pull brings; after the pull is the one moment
  every path passes with the remote's shape in hand.
- **Nothing under a signature changes.**

## Notes
