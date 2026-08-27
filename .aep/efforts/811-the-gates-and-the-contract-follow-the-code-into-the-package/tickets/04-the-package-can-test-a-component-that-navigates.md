---
status: resolved
blocked-by: ['03']
---

# test(design): the package can test a component that navigates

## Outcome

A packaged component that navigates is tested in the package, the way a packaged component that
does not is, and the three subjects #781 left uncovered are covered.

## Acceptance Criteria

Traces requirement 3 and requirement 4 of the spec, and its criterion 3 and criterion 4.

- [x] A component test in `packages/design` can render a subject that imports `$app/navigation`
      without the run failing to resolve it. `vitest.config.js` aliases the specifier to
      `src/tests/app-navigation.ts`, and both new files render subjects that reach it:
      `record-surface.svelte.test.ts` and `back-control.svelte.test.ts`, `Tests 3 passed` each.
- [x] `record-surface`'s two contract keys are covered: what it says while the record is on its
      way, and what it says where there is no such record. Both are asserted against a word the
      test supplies through the contract, so a hard-coded string would fail rather than pass by
      coincidence, and the not-found test asserts the loading sentence is **absent** as well.
- [x] `back-control`'s reads of `previous` are covered. Two of the three are reachable at render,
      the `aria-label` and the `sr-only` span, and both are asserted. The third is
      `Tooltip.Content`, which bits-ui instantiates only on open, so a render-time test cannot
      reach it: that is the limit the spec already names for eight families, and the test file
      says so. Where the control navigates to is covered too, and the fallback is a different
      screen from the trail so neither assertion can pass for the wrong reason.
- [x] Whatever supplies `$app/*` under test is scaffolding under `packages/design/src/tests/`,
      reachable by no consumer, and `[[rules/testing]]` records the arrangement. **Measured, not
      argued**: `await import('@rentable/design/tests/app-navigation.js')` from `apps/desktop`
      gives `ERR_MODULE_NOT_FOUND`, because the `exports` map sends `./*` to `./src/lib/*` and
      this file is one directory above that. The rule records the alias, why it is the runner's
      rather than the package's, and why `apps/desktop` needs none of it.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. `check` reported `0 ERRORS 0 WARNINGS` on
      2807 and 9209 files; `lint` printed the prettier line and nothing else; `test` reported
      `Tasks: 4 successful, 4 total`, with the package's vitest half at `Tests 58 passed`.

## Relevant areas

`packages/design/vitest.config.js` configures the component runner and declares no alias of any
kind. `packages/design/svelte.config.js` deliberately declares none either, and the comment
there says why, so whatever is added is the test runner's rather than the package's.

The four modules that reach `$app` are `packages/design/src/lib/back.svelte.ts`,
`packages/design/src/lib/create-intent.ts`, `packages/design/src/lib/block/record-surface.svelte`,
and `back-control.svelte` transitively through `back.svelte.js`.

`back-control` will need a fixture on top of whatever this adds: a tooltip root reads the
provider's context and throws where there is none.

## Constraints

- **The package may import `$app/*` and that is settled.** It is answered in
  `[[efforts/773-the-design-system-becomes-a-package/spec]]` under Open Questions, and it is an
  acceptance criterion of #781. This ticket makes the runner agree with the decision; it does
  not reopen it.
- **Nothing added here may reach a consumer.** The package's `exports` map is an identity
  wildcard over `src/lib/`, so a stub written there is public. `src/tests/` is not.

## Notes

Found at #781, which moved `record-surface` and `back-control` into the package and added the
keys `loadingRecord`, `noResults` and a third reader of `previous`. All three were left
uncovered, and both review axes flagged it independently. The attempt failed at resolution
rather than at an assertion: `Failed to resolve import "$app/navigation" from
"src/lib/block/record-surface.svelte"`. Raised as #797.

Ticket 01 is the same root cause on the other gate: the lint gate does not judge navigation in
this package, and this runner cannot load it. Neither gates the other; they are separate fixes.

Gated on ticket 03 so the loading-sentence test pins the corrected string rather than the wrong
one.
