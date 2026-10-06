---
status: open
---

# fix(desktop): replica sync gives up on a silent network and frees the database

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *15*).

## Outcome

Every replica push, pull and replication, for workspaces and the organization store, is treated as offline after 30 seconds without progress (ten-minute ceiling), and no network call holds the database lock so as to stall queries or launch.

## Acceptance Criteria

Traces requirement 15 and criterion 15.

- [ ] `database/bound.rs` with the inactivity bound; the five engine call sites wrapped; timeouts answer the existing offline values.
- [ ] `open.rs` downgrades its write lock before the pull.
- [ ] Rust tests against a silent server per criterion 15, including a query completing while a replication waits.

## Relevant areas

- `apps/desktop/tauri/src/database/{mod.rs,bound.rs}`
- `apps/desktop/tauri/src/organization/{store/mod.rs,workspace/open.rs,session/command.rs}`
- `apps/desktop/tauri/src/sync/`

## Constraints

- **Measure first.** If a query cannot run while a sync is stalled, whatever lock is held, stop and record it: that returns the effort to plan ([[policies/execution]]).
- Rust tests run with `--test-threads=1` ([[references/cargo]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
