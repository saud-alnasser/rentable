---
status: open
blocked-by: [15]
---

# feat(desktop): complexes and their units are grids of cards

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The complex directory and a complex's unit directory draw tiles with the content and heights ticket 15 fixed: a complex's location and its non-zero unit counts; a unit's status with its word and its occupant.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for complexes and units.

- [ ] Each card has its own test: every fact has an svg, the unit's status shows its word, no count of zero.
- [ ] Both directories pass `recordMinWidth` and the fixed heights; their list behaviour still passes its tests.

## Relevant areas

- `apps/desktop/src/lib/complex/component/directory.svelte`, `apps/desktop/src/lib/complex/unit/component/directory.svelte`, new card components beside them

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
