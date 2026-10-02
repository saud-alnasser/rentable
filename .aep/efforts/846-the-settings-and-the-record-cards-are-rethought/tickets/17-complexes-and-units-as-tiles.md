---
status: open
blocked-by: [15]
---

# feat(desktop): complexes are a grid of cards, and units keep their rows

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The complex directory draws tiles with the content and height ticket 15 fixed: a complex's location and its non-zero unit counts. A complex's unit directory keeps its compact rows (requirement 18, narrowed 2026-10-02 at the human's word: units are reached through their complex or contract, and a tile spends space a unit does not need); its row shows the unit's status with its word and its occupant, as the evidence of ticket 15 gives it, at the row height it has.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for complexes and units.

- [ ] The complex card has its own test: every fact has an svg, no count of zero.
- [ ] The complex directory passes `recordMinWidth` and the fixed height; the unit directory passes neither and stays one column of rows, its status showing its word; both lists' behaviour still passes its tests.

## Relevant areas

- `apps/desktop/src/lib/complex/component/directory.svelte`, `apps/desktop/src/lib/complex/unit/component/directory.svelte`, new card components beside them

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
