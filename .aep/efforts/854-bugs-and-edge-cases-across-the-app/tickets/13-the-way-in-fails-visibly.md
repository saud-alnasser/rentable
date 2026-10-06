---
status: open
---

# fix(desktop): the way in shows its failures and keeps the workspace name

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *10*, *11*).

## Outcome

A failure opening the workspace after sign-in, first-run or no-workspace setup reaches the error screen, and a failed workspace create keeps the typed name.

## Acceptance Criteria

Traces requirements 10 and 11, and criteria 10 and 11.

- [ ] `signIn` and `standingChanged` send a throw to `machine.fail`.
- [ ] The workspace dialog and the no-workspace screen spread `surfaceForm`.
- [ ] Startup harness tests end in `error`, never `loading` or a silent wall; Vitest tests fail a create from both surfaces and find the name kept.

## Relevant areas

- `apps/desktop/src/lib/startup/{wall.ts,machine.ts}`
- `apps/desktop/src/lib/organization/workspace/component/dialog.svelte`
- `apps/desktop/src/lib/startup/component/no-workspace.svelte`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
