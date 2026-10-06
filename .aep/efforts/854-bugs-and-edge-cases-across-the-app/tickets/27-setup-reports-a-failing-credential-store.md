---
status: open
---

# fix(desktop): organization setup reports a failing credential store, not "not connected"

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

Every Turso act, including setup, connect and reconnect through the organization setup path, tells a credential store that cannot answer from one that holds no token.

## Acceptance Criteria

Traces requirement 19 and criterion 19.

- [ ] `organization/setup` `authority()` keeps `TursoNotConnected` only for an absent token and passes any other `platform_token` error through as a credential error.
- [ ] A Rust test with `Memory::refuse_the_next_read()` sees setup's authority answer a credential error, and the absent case still answers not connected.

## Relevant areas

- `apps/desktop/tauri/src/organization/setup/mod.rs`
- `apps/desktop/tauri/src/turso/platform/live.rs` (the same rule, fixed by ticket 19)

## Constraints

- Rust tests run with `--test-threads=1` and a `CARGO_TARGET_DIR` of the implementer's own outside the worktree path (Windows path limit).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
