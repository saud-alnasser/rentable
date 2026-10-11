---
status: resolved
---

# fix(design): labels on fills read in both appearances

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, Labels on fills; Components, `pkg/tokens.css`*).

## Outcome

Every label drawn on a primary, destructive or permitted fill reads at 4.5:1 or more in light and dark, through fill tokens beside the text tokens, and the token test fails when a pairing does not.

## Acceptance Criteria

Traces requirement 9 and criterion 9.

- [x] `packages/design/src/lib/tokens.css` declares `--primary-fill`, `--destructive-fill`, `--permitted-fill` and `--destructive-foreground` in both appearances, mapped under `@theme inline`; no `text-white` remains on a destructive fill. Verified: the diff declares all four in both blocks and maps each under `@theme inline`; `tokens.test.ts` asserts the mappings and refuses `text-white` in the design package; a grep finds no `text-white` on a destructive fill in either package.
- [x] Every label site the plan lists draws on the fill token; the error badge's `/70` fill is solid. Verified: the diff moves button, badge, field-error, calendar-day, checkbox, input, way-in-surface, ending-soon, end-date-field and add-sheet onto the fill tokens, plus the rail mark to match the way-in mark; the badge's error fill is solid, and the test refuses any fill alpha its table does not list.
- [x] `packages/design/src/lib/tests/tokens.test.ts` checks each `{ fill, label }` pair in both appearances at 4.5:1, including each fill composited at the alpha its hover uses over the background, card and popover, and passes; text tokens still pass their existing checks. Verified: `node --test src/lib/tests/tokens.test.ts` in packages/design: 32 tests, 32 pass, 0 fail; lowest pair 4.62:1 (dark primary and destructive, solid).

## Relevant areas

- packages/design/src/lib/tokens.css, tests/tokens.test.ts
- packages/design/src/lib/primitive/button/button.svelte, primitive/badge/badge.svelte, block/field-error.svelte, calendar-day.svelte, checkbox.svelte, input.svelte, way-in-surface.svelte
- apps/desktop/src/lib/dashboard/component/ending-soon.svelte, contract/component/end-date-field.svelte, organization/workspace/component/add-sheet.svelte

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The text tokens keep their values unless a light fill aliases one that already passes; text on surfaces must not regress.
- [[rules/frontend]], under *Styling*, is amended where it describes the token layer.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
