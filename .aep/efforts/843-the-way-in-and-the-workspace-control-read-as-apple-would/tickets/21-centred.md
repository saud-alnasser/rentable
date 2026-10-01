---
status: resolved
blocked-by: []
---

# fix(desktop): the loading and the way in's lone sentences sit in the middle

## Outcome

At the human's word on their walk, 2026-10-01: the loading after the way in, and a launch's, sits in
the middle of the window rather than from the top, in the same column as a step; and the way in's
sentences that stand alone under a step's fields or button ("can't sign in?"'s answer, the sign-in's
wait, the first run's working line, the join's reading line, the no-workspace screen's two) are
centred with the column.

## Acceptance Criteria

Traces requirements 1 and 9 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1 and 9.

- [x] The way-in surface takes `centred`, which the loading passes; a component test finds the
      loading's column the step's measure and padding, centred rather than placed from the top. *Verified:
      "the loading draws the mark and the bar in the way-in column, in the middle of the window"
      passes (5 in `loading.svelte.test.ts`).*
- [x] "Can't sign in?"'s answer is centred; a component test finds `text-center` on it. *Verified: the
      sign-in test finds it in both locales; seen on screen on the human's wall.*
- [x] The sign-in's wait, the first run's working line, the join's reading line and the
      no-workspace screen's creating line and owner-only sentence are centred. *Verified: each carries
      `text-center`; 102 startup and setup tests pass, `pnpm check` 0 errors.*

## Relevant areas

- `packages/design/src/lib/block/way-in-surface.svelte`, `startup/component/{loading,sign-in,no-workspace}.svelte`
- `organization/setup/component/{walk,connect-screen}.svelte`

## Notes

*Appended 2026-10-01 from the human's walk. It narrows ticket 08's "the same column as on a way-in
step" to the same mark and measure: the loading asks nothing and changes no step, so it has nothing
to hold still for, and the human found its bar sitting high.*
