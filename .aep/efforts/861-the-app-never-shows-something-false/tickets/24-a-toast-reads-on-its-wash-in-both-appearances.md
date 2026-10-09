---
status: open
---

# fix(design): a toast reads on its wash in both appearances

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 3: an error toast is the only channel a failed act has; requirement 9: text on a filled tone meets 4.5:1), and ticket 01. Found at review round 2 (correctness).

## Outcome

A toned toast's text reads at 4.5:1 or more on its tinted background in light and dark, and the token test fails when one does not.

## Acceptance Criteria

Traces requirement 9 and criterion 9.

- [ ] The success, error, warning and info toasts' text reaches 4.5:1 on their wash, composited over the popover, in both appearances; the wash keeps its tone.
- [ ] `packages/design/src/lib/tests/tokens.test.ts` checks each toast tone's text on its wash in both appearances and passes, and fails on today's light values (about 4.4:1).

## Relevant areas

- packages/design/src/lib/primitive/sonner/sonner.svelte, packages/design/src/lib/tokens.css, packages/design/src/lib/tests/tokens.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The text tokens keep their values; text on surfaces must not regress.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
