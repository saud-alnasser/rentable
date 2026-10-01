---
status: resolved
blocked-by: []
---

# fix(design): the way in's motion runs the right way and its measures are the rule's

## Outcome

A route crossing between two screens of the way in keeps its direction to the end, the arrival
after a first run or a join does not slide backwards, a cancelled navigation leaves no unhandled
rejection, and the way in reads reduced motion in one place. `rules/frontend` says what the way in
draws that it did not allow: the step and route transitions, the jsdom-safe reduced-motion reader,
the mark's size on the way in, the column's offset from the top, and the step title's type row.

## Acceptance Criteria

Traces requirements 1, 4 and 9 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1 and 9. From review round 1: correctness 1, 2, 6 and 7; standards 3 in part, 4,
5 and 9.

- [x] A way-in surface unmounted while `crossWayIn` runs leaves `--way-in-shift` and
      `data-way-in-motion` on the root; a surface clears them only for a transition it started. A
      component test unmounts a surface mid-crossing and finds both still set. *Verified:
      "a surface unmounted while a route crossing runs leaves the crossing its direction" passes in
      `way-in-surface.svelte.test.ts` (22 passed), and fails with the old clearing put back.*
- [x] No crossing runs when the move is the arrival: a navigation a startup pass makes under
      `loading` takes no transition. A `node:test` over the decision covers the join's and the
      first run's arrivals. *Verified: `navigationCrossing` in `startup/screen.ts`; `screen.test.ts`
      printed 32 pass, including the join's and the first run's arrivals taking no crossing, and back
      out of a walk before any pass still crossing.*
- [x] A refused link returning the join from `reading` to the form runs back, not forward, or the
      ticket says why it is left forward. *Verified: the surface's `returning`; "the form handed back
      after a refused read runs back" passes for an unreadable link and a wrong code.*
- [x] `crossWayIn` handles a rejected `complete` without an unhandled rejection; a `node:test`
      rejects `complete` and finds the root cleared and no rejection escaping. *Verified: "a
      navigation that fails clears the root, and leaves no rejection unhandled" passes, listening on
      `unhandledRejection`.*
- [x] One `reducesMotion` reader, exported from the design package, is used by both the surface
      and `crossWayIn`. *Verified: `reducesMotion` is defined only in
      `packages/design/src/lib/reduces-motion.ts`, imported by both; `pnpm check` 0 errors.*
- [x] `rules/frontend` *Motion* names the way-in step change and route crossing among what may
      transition, and the jsdom-safe reader beside `prefersReducedMotion`; its icon table gains the
      way in's `size-7` mark; its spacing section says how the way-in column's `max(5rem, 20vh)`
      offset is allowed; and the widened `text-2xl` row carries a dated note. Each change is dated
      2026-10-01, effort 843. *Verified: the four amendments in `.aep/rules/frontend.md`, each dated;
      validate and prettier pass.*

## Relevant areas

- `packages/design/src/lib/block/way-in-surface.svelte`, `packages/design/src/lib/way-in-transition.ts`
- `apps/desktop/src/lib/startup/component/root.svelte`, `startup/screen.ts`
- `apps/desktop/src/lib/organization/setup/component/connect-screen.svelte`
- `.aep/rules/frontend.md`

## Notes

*Appended 2026-10-01 from review round 1. The mark's size and the column's offset are the look the
human judged on screen (ticket 01), so the rule is amended to record them rather than the look
changed.*
