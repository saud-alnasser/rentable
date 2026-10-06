---
status: open
---

# fix(desktop): undo is forgotten when the workspace or session changes

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R1*).

## Outcome

Nothing recorded in one workspace or session can be undone or redone in another: switching workspace, signing out, raising the sign-in wall, and selecting or removing an organization empty both stacks and withdraw the open undo offer.

## Acceptance Criteria

Traces requirement 1 and criterion 1.

- [ ] `forgetEveryChange()` exported from `undo/index.ts` and reached by startup through a new `undo.forget()` port wired in `startup/browser.ts`.
- [ ] Called in `switchWorkspace` before `openWorkspace`, in `raiseSignInWall`, in `signOut`, and in the wall's `select` and `remove`.
- [ ] Startup harness tests record an inverse, run each of the five acts, and find `undoable` and `redoable` both null; `undo/tests/move.test.ts` pins that clearing withdraws an outstanding offer.
- [ ] The comments in `undo/undo.ts` and `undo/move.ts` that say nothing clears the stack are corrected.

## Relevant areas

- `apps/desktop/src/lib/undo/{undo.ts,move.ts,index.ts}`
- `apps/desktop/src/lib/startup/{ports.ts,browser.ts,switch.ts,machine.ts,wall.ts}`
- `apps/desktop/src/lib/startup/tests/{harness.ts,wall.test.ts,running.test.ts}`

## Constraints

- Startup reaches the stack only through the port, never by importing `$lib/undo` into `machine.ts` or `wall.ts` ([[rules/module-layout]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
