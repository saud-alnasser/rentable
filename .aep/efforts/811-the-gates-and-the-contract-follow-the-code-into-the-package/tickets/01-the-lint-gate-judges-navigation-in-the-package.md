---
status: open
---

# fix(tools): the lint gate judges navigation in the design package

## Outcome

A `goto` or a bare `href` written in a packaged component is judged by the same rule that judges
one written in `apps/desktop`, or a rule records that it is not and why, where somebody adding a
component would meet it. Either way `pnpm lint` reports zero warnings and the two live
directives mean what they say.

## Acceptance Criteria

Traces requirement 1 and requirement 2 of the spec, and its criterion 1 and criterion 2.

- [ ] `svelte/no-navigation-without-resolve` reports on `packages/design/src/**`, or a rule
      records that it does not and why.
- [ ] The two `eslint-disable` directives eslint reports as unused resolve one way or the other:
      they suppress a rule that fires, or they go.
- [ ] `pnpm lint` reports zero warnings.

## Relevant areas

`eslint.config.js:8` imports `apps/desktop/svelte.config.js`, and `:43` hands it to the Svelte
parser as `svelteConfig` for every file in the repository. The rule scopes itself to that
project, so it is inert everywhere else.

The two directives are `packages/design/src/lib/back.svelte.ts:34` and
`packages/design/src/lib/primitive/button/button.svelte:2`.

## Constraints

- **The gap is narrow and the fix should be too.** Measured at #778 with a probe component under
  `packages/design/src/lib/primitive/`: `svelte/no-at-html-tags` reported and
  `svelte/no-navigation-without-resolve` did not, on the same file carrying a live
  `goto('/somewhere')` and a bare `href`. So the Svelte plugin runs there; it is the
  SvelteKit-aware half that does not.
- **Do not delete the directives to clear the warnings.** Both are live surface:
  `back.svelte.ts` calls `goto`, and `button.svelte` renders anchors. Removing them clears the
  signal without closing the gap.

## Notes

Found by the correctness axis reviewing #778, which moved 38 primitive families and fourteen
helper modules into the package. The rule stopped applying to those files the moment they
crossed, and nothing failed. Raised as #792 before efforts carried their tasks as files.

CI runs `pnpm exec eslint .` with no `--max-warnings`, so this gates nothing today.

`.aep/scripts/**` is ignored by this config and stays ignored: the protocol ships those files
and every `/aep:update` replaces them.
