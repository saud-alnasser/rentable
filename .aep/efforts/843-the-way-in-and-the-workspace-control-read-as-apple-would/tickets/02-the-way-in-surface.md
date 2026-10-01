---
status: resolved
blocked-by: [01]
---

# feat(design): the way in has a surface of its own

## Outcome

`packages/design` holds `block/way-in-surface.svelte` and `block/way-in-position.svelte`, with the
props the plan gives. The surface puts the mark, title, one description line, position, body,
actions, back and foot in fixed places. When its `step` key changes, it commits the change inside a
same-document view transition that runs in the reading direction. The standalone surface is
unchanged, and the interface rule says which screens use which surface.

## Acceptance Criteria

Traces requirements 1, 4 and 5 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1, 4 and 5.

- [x] A component test renders the surface, changes `step`, and finds the same mark and title nodes
      after the change as before. *Verified: `block/tests/way-in-surface.svelte.test.ts`, "a step change
      keeps the mark and the title where they were, as the same nodes"; `pnpm test` in `packages/design`
      printed 27 files, 133 tests passed.*
- [x] A component test stubs `document.startViewTransition` and asserts it is called on a step
      change. Without the stub, the change is committed directly with no error. *Verified: "a step change runs
      inside a view transition, over a copy of the step it leaves" (called once on the change, not on
      first render) and "without view transitions the new step is drawn directly, and nothing throws"
      pass.*
- [x] Back is the shared `block/back-control.svelte`, drawn only when `back` is handed in, 1rem in
      from the content area's top-start corner. Its arrow mirrors in Arabic. *Verified: "back is the
      shared control, 1rem in from the top-start corner, mirrored in Arabic" finds `[data-back-control]`,
      `absolute top-4 start-4` and `rtl:rotate-180`; "back is drawn only where it is handed in" passes.*
- [x] The column is placed from the top at `max(5rem, 20vh)`, not centred, so the mark and the
      title stay put when a step's contents change height. *Verified: "the column is placed from the
      top, and is not a card" finds `pt-[max(5rem,20vh)]`, no centring, and no `bg-card`, shadow or ring.*
- [x] The position renders "step n of m" from `position`, in one treatment, as a small muted line
      above the title, and renders nothing without it. *Verified: "the position is one small muted line
      above the title" and "without a position nothing is drawn for one" pass. The caller hands in the
      words with the count (`{ at, of, label }`), since [[rules/frontend]] has the caller count.*
- [x] Under reduced motion no transition runs. A node test over `tokens.css` checks that the token
      layer's `::view-transition-*` gate covers the names the surface uses. *Verified: "under reduced
      motion no transition is asked for" passes beside its control case; `motion.test.ts` prints "the
      reduced-motion gate covers every view transition name the way-in surface uses".*
- [x] Durations and easings are named tokens, and the package's `motion.test.ts` passes. *Verified:
      `motion.test.ts` passes, including "no surface in the package writes a duration or an easing of
      its own"; the node suite printed 160 pass, 0 fail.*
- [x] [[rules/interface]] *Application surfaces* names both surfaces: the way-in surface for the
      steps before the application, the standalone surface for the application failing. *Verified: the
      section names both, keeping the ADR 0015 line and dating the narrowing.*

## Relevant areas

- `packages/design/src/lib/block/` (`standalone-surface.svelte`, `back-control.svelte`, `loading.svelte`)
- `packages/design/src/lib/tokens.css` (motion tokens, reduced motion)
- `packages/design/package.json` exports

## Constraints

- Follow [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/plan]], *Architecture*
  and *Interfaces*. The look is what ticket 01 recorded.
- The surface is not a card: no `bg-card`, shadow or ring around the column.
- No new dependency; the transition is feature-detected.

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): back moved to the content area's corner, the position above the title, and the column placed from the top.*

*Built 2026-10-01: the mark is the 3.5rem tile the look was judged at, not the rail's 2.5rem one;
the plan's `position` of `{ at, of }` gained a `label`, handed in by the caller.*
