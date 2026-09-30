---
status: resolved
blocked-by: [12, 13]
---
# refactor(desktop): undo and redo are one capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The stacks, issuing an inverse, the undo shortcut and the toast's undo action become `src/lib/undo/` (was `design/inverse.ts`, `inverse.svelte.ts`, `undo-shortcut.ts`). `mutation/` calls undo's API when a declaration carries an `inverse`; nothing else in the tree knows how undo works. This is the worked case of requirement 20.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [x] A search finds undo logic nowhere outside `undo/` (criterion 20). Verified: a search of `apps/desktop/src` (tests aside) for `inverseStack`, `undoStack`, `applyUndo`, `applyRedo`, `UNDO_KEY`, `REDO_KEY`, `recordInverse`, `announceWithOffer`, `UndoOffer`, `OFFER_DURATION`, `design/inverse` and `undo-shortcut` outside `lib/undo/` finds only `mutation/mutation.ts` importing and calling undo's API (`recordInverse`, `announceWithOffer`, the `UndoOffer` type). Mutation hands undo its refresh, history and failure functions per entry; undo imports nothing from mutation.
- [x] The undo tests move and keep their assertions. Verified: `inverse.test.ts` and `undo-shortcut.test.ts` moved to `undo/tests/undo.test.ts` and `key.test.ts` with only imports changed; the two offer blocks moved from `mutation.test.ts` to `undo/tests/move.test.ts`; the child's sorted diff of every `assert`, `it(` and `describe(` line before and after printed nothing.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; the layer test passes with no stale line.

## Relevant areas

- `src/lib/design/inverse*.ts`, `src/lib/design/undo-shortcut.ts`, `src/lib/design/mutation.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
