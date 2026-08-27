---
status: resolved
---

# fix(tools): the lint gate judges navigation in the design package

## Outcome

A `goto` or a bare `href` written in a packaged component is judged by the same rule that judges
one written in `apps/desktop`, or a rule records that it is not and why, where somebody adding a
component would meet it. Either way `pnpm lint` reports zero warnings and the two live
directives mean what they say.

## Acceptance Criteria

Traces requirement 1 and requirement 2 of the spec, and its criterion 1 and criterion 2.

- [x] `svelte/no-navigation-without-resolve` reports on `packages/design/src/**`, or a rule
      records that it does not and why. **Both, and that is the finding.** A probe component at
      `packages/design/src/lib/primitive/probe-nav.svelte` carrying `goto('/somewhere')` and
      `<a href="/elsewhere">` reported `5:8 error Unexpected goto() call without resolve()` and
      `9:4 error Unexpected href link without resolve()`, so the rule reaches the package. What
      it cannot see is a value typed `string`: `goto(where ?? fallback)` written identically in
      both projects reported in `apps/desktop` and was silent in `packages/design`.
      `[[references/eslint]]` records the mechanism and both measurements;
      `[[rules/frontend]]` records what that leaves the two sides owing. The probes were deleted.
- [x] The two `eslint-disable` directives eslint reports as unused resolve one way or the other:
      they suppress a rule that fires, or they go. **Four, not two, and they went.** Each was
      deleted in turn and `eslint <file>` run against the result: all four reported nothing, so
      none of them suppresses a rule that fires. The prose above each one stayed, and the three
      props that carry a path now say in their own docstrings that it arrives resolved.
- [x] `pnpm lint` reports zero warnings. `prettier --check . --end-of-line auto && eslint .`
      printed `All matched files use Prettier code style!` and nothing else.

## Relevant areas

`eslint.config.js:8` imports `apps/desktop/svelte.config.js`, and `:43` hands it to the Svelte
parser as `svelteConfig` for every file in the repository. *That was believed to be what scoped the
rule to one project. It is not: the plugin gates its SvelteKit rules on a `@sveltejs/kit` version it
resolves from the file's own package, and `packages/design` declares one. `[[references/eslint]]`
has the re-measurement, taken 2026-08-27.*

There are **four** directives, not two: `packages/design/src/lib/back.svelte.ts:34`,
`packages/design/src/lib/block/record-card.svelte:49`,
`packages/design/src/lib/block/record-surface.svelte:104` and
`packages/design/src/lib/primitive/button/button.svelte:2`. The last two arrived with #781, after
this ticket was cut.

## Constraints

- **The gap is narrow and the fix should be too.** Measured at #778 with a probe component under
  `packages/design/src/lib/primitive/`: `svelte/no-at-html-tags` reported and
  `svelte/no-navigation-without-resolve` did not, on the same file carrying a live
  `goto('/somewhere')` and a bare `href`. So the Svelte plugin runs there; it is the
  SvelteKit-aware half that does not.
- **Do not delete the directives to clear the warnings.** Both are live surface:
  `back.svelte.ts` calls `goto`, and `button.svelte` renders anchors. Removing them clears the
  signal without closing the gap.

  *Measured on 2026-08-27, this constraint's premise does not hold. With each directive deleted,
  eslint reported nothing at its site: the value at all four is typed `string`, and a `string` is
  what the rule accepts in a package with no route types. They suppress nothing, so the criterion's
  second branch is the one that applies and they go. The prose above each stays.*

## Notes

Found by the correctness axis reviewing #778, which moved 38 primitive families and fourteen
helper modules into the package. The rule stopped applying to those files the moment they
crossed, and nothing failed. Raised as #792 before efforts carried their tasks as files.

CI runs `pnpm exec eslint .` with no `--max-warnings`, so this gates nothing today.

`.aep/scripts/**` is ignored by this config and stays ignored: the protocol ships those files
and every `/aep:update` replaces them.
