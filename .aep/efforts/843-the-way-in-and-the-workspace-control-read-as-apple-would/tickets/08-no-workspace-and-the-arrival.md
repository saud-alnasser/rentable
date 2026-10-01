---
status: open
blocked-by: [07]
---

# feat(desktop): the no-workspace screen and the arrival belong to the way in

## Outcome

The no-workspace screen draws on the way-in surface. After a first run, a join or a sign-in, the
loading screen keeps the way-in layout and the mark, with its stage bar in the column, so arriving
reads as the last step. The rail appears with the application.

## Acceptance Criteria

Traces requirements 1, 3, 8 and 9 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 3, 8 and 9.

- [ ] `startup/component/no-workspace.svelte` renders `way-in-surface`, with one prominent "create
      workspace" for the owner and its sentence for everyone else.
- [ ] `startup/component/loading.svelte` renders the mark and the stage bar inside the column of
      `way-in-surface`. A component test finds the same mark node class and column as on a way-in
      step.
- [ ] For the owner, the workspace name field is focused on arrival, and Enter creates.
- [ ] The launch loading, before anybody is in, uses the same layout.
- [ ] The no-workspace screen passes `WayInPreferences` to the surface's `foot`, with no extras.

## Relevant areas

- `apps/desktop/src/lib/startup/component/{no-workspace,loading}.svelte`
- `apps/desktop/src/lib/workspace/component/fields.svelte`

## Constraints

- [[rules/interface]] *Loading*: the startup bar reports stages, so it stays a bar.

## Notes

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*
