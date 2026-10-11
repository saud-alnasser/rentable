---
status: resolved
---

# fix(desktop): the figure band never shows another period's figures

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 2: while the figures are loading the band draws the loading treatment; criterion 2), and ticket 05. Found at review round 2 (correctness).

## Outcome

When the reader changes the landing screen's period, the band draws the loading treatment until the new period's figures arrive, never the previous period's figures under the new period's name.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [x] While the dashboard read holds the previous period's answer as a placeholder for the new one (`isPlaceholderData`), the band and the sections draw the loading treatment; once the new answer arrives they draw it. Verified: `landing.svelte` reads `isPlaceholderData`: while it holds, the money figures, occupancy, outstanding and the sections draw the loading block in their cards' height, and the band's frame and the period control stay mounted and focused; the new answer is drawn once it arrives.
- [x] `dashboard/tests/landing.svelte.test.ts`: with the first period answered and the second held pending, the band draws no figure from the first period; once the second answers, its figures are drawn. Verified: `vitest run src/lib/dashboard`: 23 of 23 pass; the new test failed against the earlier landing with `expected [ 800, 1000 ] to deeply equal []`, and now finds no first-period figure while the second is held, the trigger connected and focused, then 2500 and 3000 drawn.

## Relevant areas

- apps/desktop/src/lib/dashboard/component/landing.svelte, dashboard/query.ts, dashboard/tests/landing.svelte.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
