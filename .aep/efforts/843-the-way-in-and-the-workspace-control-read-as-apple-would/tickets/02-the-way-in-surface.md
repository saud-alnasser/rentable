---
status: open
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

- [ ] A component test renders the surface, changes `step`, and finds the same mark and title nodes
      after the change as before.
- [ ] A component test stubs `document.startViewTransition` and asserts it is called on a step
      change. Without the stub, the change is committed directly with no error.
- [ ] Back is the shared `block/back-control.svelte`, drawn only when `back` is handed in, in the
      column's top corner. Its arrow mirrors in Arabic.
- [ ] The position renders "step n of m" from `position`, in one treatment, and renders nothing
      without it.
- [ ] Under reduced motion no transition runs. A node test over `tokens.css` checks that the token
      layer's `::view-transition-*` gate covers the names the surface uses.
- [ ] Durations and easings are named tokens, and the package's `motion.test.ts` passes.
- [ ] [[rules/interface]] *Application surfaces* names both surfaces: the way-in surface for the
      steps before the application, the standalone surface for the application failing.

## Relevant areas

- `packages/design/src/lib/block/` (`standalone-surface.svelte`, `back-control.svelte`, `loading.svelte`)
- `packages/design/src/lib/tokens.css` (motion tokens, reduced motion)
- `packages/design/package.json` exports

## Constraints

- Follow [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/plan]], *Architecture*
  and *Interfaces*. The look is what ticket 01 recorded.
- The surface is not a card: no `bg-card`, shadow or ring around the column.
- No new dependency; the transition is feature-detected.
