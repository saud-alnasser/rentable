---
status: open
blocked-by: [01]
---

# fix(desktop): undo and redo stand down while something covers the page

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *12*).

## Outcome

The undo and redo keys do nothing while a form, sheet or confirmation is open over the page; with only the command palette open they behave as before.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [ ] `isCovered` moves to `shortcut/covered.ts`, exported from `shortcut/index.ts`; `create/component/shortcut.svelte` imports it from there.
- [ ] `toUndoShortcuts` takes an `isCovered` predicate and each `run` applies nothing while it answers true.
- [ ] node test in `undo/tests/key.test.ts` and a Vitest test opening a sheet with a focused button: Ctrl+Z and Ctrl+Y apply nothing; with only the palette open they apply.

## Relevant areas

- `apps/desktop/src/lib/shortcut/`
- `apps/desktop/src/lib/create/component/shortcut.svelte`
- `apps/desktop/src/lib/undo/{key.ts,component/shortcut.svelte}`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
