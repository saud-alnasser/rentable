---
status: resolved
---

# fix(design): a toast reads on its wash in both appearances

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 3: an error toast is the only channel a failed act has; requirement 9: text on a filled tone meets 4.5:1), and ticket 01. Found at review round 2 (correctness).

## Outcome

A toned toast's text reads at 4.5:1 or more on its tinted background in light and dark, and the token test fails when one does not.

## Acceptance Criteria

Traces requirement 9 and criterion 9.

- [x] The success, error, warning and info toasts' text reaches 4.5:1 on their wash, composited over the popover, in both appearances; the wash keeps its tone. Verified: `node --test src/lib/tests/tokens.test.ts` in packages/design: 40 pass, 0 fail; at an 8% wash the light ratios are success 4.62, error 4.65, warning 4.66, info 4.96, and dark 11.58, 5.85, 11.21, 9.09; the wash is still a tint of its tone.
- [x] `packages/design/src/lib/tests/tokens.test.ts` checks each toast tone's text on its wash in both appearances and passes, and fails on today's light values (about 4.4:1). Verified: the 8 toast cases read the primitive's own `color-mix` and text, run in both appearances, failed 3 of 40 at the old 12% wash (4.37, 4.41, 4.41), and pass now; the frontend rule's *Styling* names the check.

## Relevant areas

- packages/design/src/lib/primitive/sonner/sonner.svelte, packages/design/src/lib/tokens.css, packages/design/src/lib/tests/tokens.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The text tokens keep their values; text on surfaces must not regress.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
