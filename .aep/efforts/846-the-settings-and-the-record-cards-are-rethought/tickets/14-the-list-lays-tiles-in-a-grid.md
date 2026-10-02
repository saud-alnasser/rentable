---
status: open
---

# feat(desktop): the list shell lays tiles in a grid

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The shell and the card can draw a grid: `columnsFor` with a cap of three, the column gap, the selection box aligned to the top, `record-card.svelte`'s `tile` layout with its `heading`, and `Cell.Status`'s labelled form. No list turns it on yet. [[rules/interface]]'s *List presentation* and *Status presentation* say what the grid and the labelled status are.

## Acceptance Criteria

Traces requirements 18, 19 and 22, and criteria 18 and 22.

- [ ] `columnsFor` unit tests: one, two and three columns at their widths, never four, the gap counted.
- [ ] `listRows` packs three to a row; `list/tests/keyboard.test.ts` moves across and down three columns in both directions.
- [ ] A thousand-record harness with columns draws fewer cards than records.
- [ ] The grid and its skeleton both carry the gap.
- [ ] A tile renders its heading, status, facts and the actions control, and both action routes still open the same acts.
- [ ] `Cell.Status` labelled shows the icon and the word; unlabelled is unchanged.

## Relevant areas

- `apps/desktop/src/lib/list/{list.ts,component/list.svelte,component/rows.svelte,keyboard.ts,tests/}`
- `packages/design/src/lib/{group.ts,block/record-card.svelte}`
- `apps/desktop/src/lib/design/cell/status.svelte`

## Constraints

- No changeset: nothing a person sees changes until tickets 16 to 18.
