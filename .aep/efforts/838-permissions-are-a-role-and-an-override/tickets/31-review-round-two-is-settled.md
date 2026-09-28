---
status: resolved
blocked-by: [29, 30]
---

# fix(organization): review round two of the copy and the runner is settled

## Outcome

Review round two of tickets 29 and 30 found nothing blocking and a handful of small defects, and
there is no third round, so they are settled here by the orchestrator. After this, a message the
copy logs reads as one sentence, the comments say a copy not *taken* (unread or unwritten)
refuses, the engine's prefixes point at each other from both places that write them, the moved
test builder no longer names `origin/main`, and the transition module tells the next format to
teach `format_as_it_stands` the shape of the one before it, since a directory whose row is gone
reads as the shipped format.

## Acceptance Criteria

Traces requirement 13 and requirement 14 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `migrate.rs`'s unreadable-answer message and two test statements in `backup.rs` carry no run
      of spaces from a lost line continuation.
- [x] `upgrade.rs` and `migration.rs` say a copy that cannot be *taken* refuses.
- [x] `database/mod.rs`'s `HAS_A_SCHEMA` names `backup::NOT_THE_ENGINES` as the same three
      prefixes, and the source of each.
- [x] `transition/mod.rs`'s fourth move names `format_as_it_stands`.
- [x] The plan, `contexts/desktop/organization`, and `references/turso` say what tickets 29 and
      30 built.
- [x] The shared format 1 builder under `transition/test/` is admitted in `rules/testing` by the
      human's call, and its module comment cites that admission.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/migrate.rs`, `migration.rs`, `upgrade.rs`, `transition/mod.rs`,
  `transition/test/older.rs`, `backup.rs`, `database/mod.rs`
