---
status: resolved
---

# feat(desktop): the list shell lays tiles in a grid

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The shell and the card can draw a grid: `columnsFor` with a cap of three, the column gap, the selection box aligned to the top, `record-card.svelte`'s `tile` layout with its `heading`, and `Cell.Status`'s labelled form. No list turns it on yet. [[rules/interface]]'s *List presentation* and *Status presentation* say what the grid and the labelled status are.

## Acceptance Criteria

Traces requirements 18, 19 and 22, and criteria 18 and 22.

- [x] `columnsFor` unit tests: one, two and three columns at their widths, never four, the gap counted. *Verified: `node --test list/tests/columns.test.ts list/tests/keyboard.test.ts` printed pass 33, fail 0; columns covers 1, 2, 3, never 4, and 600px giving 1 while 612px gives 2.*
- [x] `listRows` packs three to a row; `list/tests/keyboard.test.ts` moves across and down three columns in both directions. *Verified: the same run: keyboard.test packs three per row and moves across and down three columns in LTR and RTL.*
- [x] A thousand-record harness with columns draws fewer cards than records. *Verified: `vitest run src/lib/list src/lib/design/cell` printed 9 files, 44 tests passed; list-grid.svelte.test draws under 1000 cells for 1000 records, three per drawn row.*
- [x] The grid and its skeleton both carry the gap. *Verified: the same list-grid test finds `gap-3` and three columns on both the grid and the skeleton.*
- [x] A tile renders its heading, status, facts and the actions control, and both action routes still open the same acts. *Verified: design `vitest run record-card.svelte.test.ts` printed 15 passed: a tile shows heading, labelled status, fact with icon and the control, and the menu button and the right-click menu list the same acts.*
- [x] `Cell.Status` labelled shows the icon and the word; unlabelled is unchanged. *Verified: `design/cell/tests/status.svelte.test.ts` (in the 44 above): labelled draws icon and visible word; unlabelled keeps the sr-only word and its class list.*

## Relevant areas

- `apps/desktop/src/lib/list/{list.ts,component/list.svelte,component/rows.svelte,keyboard.ts,tests/}`
- `packages/design/src/lib/{group.ts,block/record-card.svelte}`
- `apps/desktop/src/lib/design/cell/status.svelte`

## Constraints

- No changeset: nothing a person sees changes until tickets 16 to 18.
