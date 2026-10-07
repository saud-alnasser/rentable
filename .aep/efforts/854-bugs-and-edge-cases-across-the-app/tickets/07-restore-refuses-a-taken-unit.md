---
status: resolved
---

# fix(desktop): restoring a terminated contract refuses a unit taken since

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R4*).

## Outcome

Restoring a terminated contract, singly, in a selection, or by undoing a terminate, is refused naming the unit when another live contract now holds one of its units over intersecting dates; `contract.restoreMany` keeps its documented behaviour.

## Acceptance Criteria

Traces requirement 4 and criterion 4.

- [x] `unterminate` and `unterminateMany` check assignments through a single helper in `assignment/assignment.ts`; new refusal `contract.unitsTakenNamed` and selection reason `units-taken`, with sentences in both languages.
- [x] Router and selection tests per criterion 4, including two overlapping terminated contracts selected together; an undo test shows the undone terminate refused and left on the stack; a test pins `restoreMany` unchanged.
- [x] [[contexts/desktop/contract]] says restoring a terminated contract obeys the overlap rule.

## Relevant areas

- `apps/desktop/src/lib/contract/{router.ts,contract.ts,assignment/assignment.ts,selection/router.ts}`
- `apps/desktop/src/lib/contract/component/selection-actions.svelte`
- `apps/desktop/src/lib/contract/i18n/{en,ar}.ts`

## Constraints

- Regenerate the i18n types after adding keys.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
