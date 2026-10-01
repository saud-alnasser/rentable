---
status: resolved
blocked-by: []
---

# docs(desktop): the plan records what was built where the build departed from it

## Outcome

`plan.md` says what the build did where it departed from the plan, each with a dated note naming
the ticket that departed, so the plan is not a second, older account of the effort.

## Acceptance Criteria

Traces requirements 1, 7, 9 and 12 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1, 7, 9 and 12. From review round 1: standards 7.

- [x] *Architecture*: the column placed from the top, back in the content area's corner, and the
      position above the title (ticket 01); the foot control in the settings feature (ticket 04);
      the rail's latch kept for a switch alone (ticket 08). *Verified: dated "Built 2026-10-01 by
      ticket NN" notes beside each decision, checked against `way-in-surface.svelte`
      (`pt-[max(5rem,20vh)]`, back at `start-4 top-4`, the position before the `h1`), `settings/ui.ts`
      and `shellFor`.*
- [x] *Interfaces*: `position` as `{ at, of, label }` (ticket 02), `addressAfterSwitch(routeId,
      trailOf)` (ticket 10), the surface's `named` and optional `title` (tickets 05 and 08),
      `crossWayIn` and `wayInCrossing` (ticket 06). *Verified: an "as built" block under the planned
      Interfaces, its signatures copied from the code.*
- [x] The file table names `settings/component/way-in-preferences.svelte`, and the locale row says
      which strings stayed and why (ticket 09). *Verified: the Components row names the built path
      and when it moved; the locale row lists only `switchTo` and the locked row's strings as
      removed, with the reason `members` and `create` stayed.*
- [x] No requirement or decision in the plan is changed, only what was built is recorded; `node
      .aep/scripts/validate.mjs` reports no failures. *Verified: the diff only adds notes and two
      dated table rows; validate printed no failures.*

## Relevant areas

- `.aep/efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/plan.md`

## Notes

*Appended 2026-10-01 from review round 1.*
