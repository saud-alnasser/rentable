---
status: resolved
blocked-by: [17]
---

# fix(desktop): a failed update can be retried

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *18*).

## Outcome

A failed download can be retried in the same session, and a pending recovery record whose target is not the running version no longer blocks later updates; a failed new build with the route back showing still refuses a further update.

## Acceptance Criteria

Traces requirement 18 and criterion 18.

- [x] `Update::settle_at_launch` resolves records whose target is not the running version; `prepare` refuses only while the target is the running version.
- [x] Rust tests per criterion 18; the existing pending test is rewritten to seed the target as running.

## Relevant areas

- `apps/desktop/tauri/src/update/mod.rs`
- `apps/desktop/tauri/src/startup/mod.rs`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
