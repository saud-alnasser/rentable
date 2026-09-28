---
status: resolved
---

# fix(organization): the check before a change commits compares structure, not text

## Outcome

Review round one of tickets 32 to 37. The check compares each table's `CREATE` text with a fresh
database's, but a workspace's fresh reference is built on local SQLite while the workspace lives on
Turso's server, which may record the same table differently; one difference and every migration of
every workspace is refused for good. The organization needed a declared statement for the one table
it reshapes for the same reason. After this, as [[efforts/838-permissions-are-a-role-and-an-override/plan]]'s review note gives it, tables compare by
their columns, indexes by name, uniqueness and columns, and views and triggers by normalised text;
the declared statement is gone; the refusal's sentence names a way out; and the live test that
settles the server's side follows the repository's rules for live tests.

## Acceptance Criteria

Traces requirement 15 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `schema.rs` compares each table by its columns (name, declared type, `NOT NULL`, primary key
      position), whatever their order or defaults; each index by name, uniqueness and columns;
      views and triggers by normalised text. Tests: two statements of one table in different
      column order and with defaults compare equal; a missing column, a changed type, a lost
      `NOT NULL` and a missing index each differ.
- [x] Both paths read the structure through the engine they hold (the pipeline for a workspace, the
      turso connection for the organization, sqlx for the reference). `Shape::or`, `reshaped` and
      `MEMBER_AS_RESHAPED` are gone, and the format 1 fixture still passes the check.
- [x] `ShapeNotAsBuilt`'s sentence names a way out in English and Arabic, as its siblings do.
- [x] The live test of the whole tail in one transaction sits at the foot of `migrate.rs`, reads
      `RENTABLE_LIVE_TURSO` and fails without it, and is admitted in `rules/testing`'s live-test
      section with its property and the count; `database/test/workspace.rs`'s docs and
      `references/turso`'s count of live databases say what is true.
- [x] `contexts/desktop/organization`'s *Format* names the check before commit and its refusal.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/schema.rs`, `organization/migrate.rs`, `organization/upgrade.rs`,
  `organization/transition/{mod,two}.rs`, `database/test/workspace.rs`, `src/lib/i18n`,
  `.aep/rules/testing.md`, `.aep/references/turso.md`, `.aep/contexts/desktop/organization.md`
