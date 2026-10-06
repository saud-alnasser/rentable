---
status: open
---

# fix(desktop): a failing credential store is not reported as not connected

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *19*).

## Outcome

When the credential store cannot answer, a Turso act reports a credential error; "not connected" is reserved for a consent that is absent.

## Acceptance Criteria

Traces requirement 19 and criterion 19.

- [ ] `authority` maps only the absent case to `no_authority()`.
- [ ] `Memory::refuse_the_next_read()` and a Rust test per criterion 19.

## Relevant areas

- `apps/desktop/tauri/src/turso/platform/live.rs`
- `apps/desktop/tauri/src/credential/memory.rs`

## Constraints

- [[rules/credentials]].
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
