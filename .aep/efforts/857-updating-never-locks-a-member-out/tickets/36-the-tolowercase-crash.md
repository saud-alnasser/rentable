---
status: open
---

# fix(desktop): the interface no longer crashes reading toLowerCase

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

During the human's test of this branch on 2026-10-07 the dev log recorded `[Unhandled error] TypeError: Cannot read properties of undefined (reading 'toLowerCase')` in the client. Its cause is found and fixed.

## Acceptance Criteria

Traces requirement 8 and requirement 11.

- [ ] The cause is found from the code (every `.toLowerCase()` reachable in the flows of this effort: update, switcher, held screen, sync, roles) and recorded in Notes with the path that reaches it with an undefined value.
- [ ] A test that fails first reproduces it, and passes after the fix.

## Relevant areas

- apps/desktop/src/lib/

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
