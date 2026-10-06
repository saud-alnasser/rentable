---
status: open
---

# fix(desktop): a database the sync engine never releases is bounded and logged

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

A request waiting for the engine to finish applying a pull waits no longer than the sync bound, logs that it gave up, and answers an error, rather than hanging every request with nothing in the log.

## Acceptance Criteria

Traces requirement 15 (no network call holds the database in a way that stalls queries past the bound).

- [ ] `Held::checkout`'s wait while the engine answers Busy is capped at the sync bound and logs `replica.connection.busyTimedOut` when it gives up, answering an error the caller already handles.
- [ ] A Rust test with a connection that answers Busy forever sees the checkout give up within a short test bound and the log line written; a Busy that clears still proceeds.

## Relevant areas

- `apps/desktop/tauri/src/database/held.rs`
- `apps/desktop/tauri/src/database/bound.rs`

## Constraints

- Rust tests run with `--test-threads=1` and a `CARGO_TARGET_DIR` of the implementer's own outside the worktree path (Windows path limit).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
