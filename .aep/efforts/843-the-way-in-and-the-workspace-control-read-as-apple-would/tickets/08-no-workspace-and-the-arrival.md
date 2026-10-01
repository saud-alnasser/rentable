---
status: resolved
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

- [x] `startup/component/no-workspace.svelte` renders `way-in-surface`, with one prominent "create
      workspace" for the owner and its sentence for everyone else. *Verified: `npx vitest run
      src/lib/startup` passes; "a member with no workspace is told so, by organization name, on the
      way-in surface" finds the surface, the create as the only prominent button and no addon, and
      "and in arabic, a member who is not the owner is told whose act it is" finds the sentence and
      no button.*
- [x] `startup/component/loading.svelte` renders the mark and the stage bar inside the column of
      `way-in-surface`. A component test finds the same mark node class and column as on a way-in
      step. *Verified: `loading.svelte.test.ts`, "the loading draws the mark and the bar in the column
      of the way-in surface", compares the mark's class and its column's with a way-in step's.*
- [x] For the owner, the workspace name field is focused on arrival, and Enter creates. *Verified:
      "for the owner, the name is focused on arrival and Enter creates".*
- [x] The launch loading, before anybody is in, uses the same layout. *Verified: root draws the one
      `loading.svelte` for every load but a switch; `shellFor` gives the launch, and now the load after
      a sign-in, the way-in frame (`screen.test.ts` 28 pass, including "the load after signing in
      stays on the way in").*
- [x] The no-workspace screen passes `WayInPreferences` to the surface's `foot`, with no extras.
      *Verified: "the no-workspace screen carries the preferences control at its foot, and nothing else
      there".*

## Relevant areas

- `apps/desktop/src/lib/startup/component/{no-workspace,loading}.svelte`
- `apps/desktop/src/lib/workspace/component/fields.svelte`

## Constraints

- [[rules/interface]] *Loading*: the startup bar reports stages, so it stays a bar.

## Notes

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*

*Built 2026-10-01: the surface's title became optional for the loading, which asks nothing;
the shared workspace field takes `glyph={false}` here and keeps its glyph in the settings dialog;
and `shellFor` gives the load after a sign-in to the way in, as the plan's Architecture says,
where ticket 03 had kept the rail for it.*
