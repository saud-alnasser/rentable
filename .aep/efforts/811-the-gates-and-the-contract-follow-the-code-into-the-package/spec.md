---
status: accepted
---

# Problem

Across #778, #779 and #781, 38 primitive families, fourteen helper modules and a set of blocks
crossed out of `apps/desktop/src/lib/design/` and into `@rentable/design`. **Every mechanism
that would have caught a mistake in that code stayed behind, and nothing failed when they did.**

**The lint gate half-sees SvelteKit navigation.** *This paragraph said the gate was inert in the
package, on a probe taken at #778. Re-measured on 2026-08-27 while building ticket 01, that is no
longer true, and the correction is left in place rather than rewritten away because it is what the
requirements below were cut against.* The rule does reach `packages/design/src/**`:
`packages/design/package.json` now declares `@sveltejs/kit` under `devDependencies`, which is what
the plugin resolves a SvelteKit version from, and the dependency arrived when the package started
importing `$app/*`. A probe in the same place carrying `goto('/somewhere')` and a bare
`<a href="/elsewhere">` reported both.

What is blind is the half that reads types. `no-navigation-without-resolve` accepts any value whose
type is `ResolvedPathname`, `@sveltejs/kit` ships that defaulting to `string`, and `svelte-kit sync`
is what narrows it per application. The package runs no sync and has no routes, so every `string`
passes and only a literal written in the package is caught. The same `goto(where ?? fallback)`
reports in `apps/desktop` and is silent in `packages/design`. **Nothing closes that from inside the
package**, because narrowing the type would mean naming a consumer's routes in the library written
not to know them. `[[references/eslint]]` carries the measurement and `[[rules/frontend]]` the
obligation it leaves on both sides.

The signal that remained was **four** `eslint-disable` directives eslint reports as unused, not two:
`back.svelte.ts`, `block/record-card.svelte`, `block/record-surface.svelte` and
`primitive/button/button.svelte`. Every one of them was measured to suppress nothing.

**The package's own test runner cannot load a component that navigates.** Four modules in
`@rentable/design` import `$app/*` — `back.svelte.ts`, `create-intent.ts`,
`block/record-surface.svelte`, and `back-control.svelte` transitively — and not one of them can
have a test, because `packages/design/vitest.config.js` declares no alias and
`svelte.config.js` deliberately declares none either. The attempt at #781 failed at resolution
rather than at an assertion: `Failed to resolve import "$app/navigation" from
"src/lib/block/record-surface.svelte"`.

**The desktop cannot render a component in a test at all.** Its `test` script is
`node --import tsx --test` alone; `vitest`, `jsdom` and `@testing-library/svelte` are
configured in `packages/design` only. That was survivable while the desktop owned its
components. It stopped being survivable at #779, when ten families became context reads:
`routes/+layout.svelte` draws `startup-unreadable` **outside** `DesignProvider` and
`TooltipProvider`, and that is the one screen with no error boundary above it and no way out
but quitting. Two things could make it throw, and both are held shut by a prop value rather
than by structure — `tone="error"` on the standalone surface, and `tooltip={false}` on two
`SurfaceAction` calls, against a prop that defaults to `true`. Neither guard is covered by
anything, and `svelte-check` cannot see either, because a missing context is a runtime throw.

**A primitive that no test can name is the same gap one layer down.** `callout.svelte` is the
one primitive with no `data-slot`, so the two block tests that need it anchor on
`div.rounded-md.border` — a class list rather than a name — and both carry a comment saying so.
A test asserting on the error line is then held to the callout's styling, and a purely visual
change breaks a test about words.

**And with nothing reading the contract, the contract is already wrong.** #781 inverted
`record-surface`'s strings onto the package's public contract, documenting `loadingRecord` as
what a record surface says while the record is still being read. Its only consumer supplies
`$LL.common.messages.loadingApp()`, so every record page in this application says `loading
app...` while a record is on its way, and the application loaded some time ago. The words on
screen did not change at #781; what changed is that the mismatch is now written into a
docstring saying one thing and the only consumer supplying another. The desktop's own locale
file has carried `loadingTenant: 'loading tenant...'` since long before, so the sentence this
wants already exists and is not used.

Four gaps and one defect, and the defect is the point: **the contract went wrong immediately,
and the only reason anybody knows is that a human read the docstring against the locale file.**

**And a rule the desktop already wrote down is waiting on the same harness.**
`[[efforts/810-the-contract-record-reads-as-one-in-arabic/spec]]` fixed two surfaces that drew a
number by hand, and the test that would catch the third could not be written, for the reason
above: the desktop cannot render a component in a test. That effort carried the test as a
criterion until 2026-08-27, when the human moved it here rather than hold two shipped fixes
behind an effort that had not started. It is the first thing the harness is for.

# Goal

Code that lives in `@rentable/design` is judged by the same gates that judged it in
`apps/desktop`, and the package's public contract is held by a test rather than by a docstring
nobody executes.

# Scope

- `eslint.config.js`, and how a SvelteKit-aware rule reaches a second project.
- `packages/design`'s component runner, and what supplies `$app/*` under it.
- A component test harness for `apps/desktop`, which has none.
- `callout.svelte`'s root attribute, and the two block tests written around its absence.
- What `record-surface` says while a record is on its way, in the contract and at the caller.
- The phone rule the desktop states in `cell/phone.svelte` and nothing holds shut.

# Requirements

1. A `goto` or a bare `href` written in a packaged component is judged by the same rule that
   judges one written in `apps/desktop`, or the gap is recorded where somebody adding a
   component would meet it.
2. `pnpm lint` reports zero warnings.
3. A component test in `packages/design` can render a subject that imports `$app/navigation`.
4. `record-surface`'s two contract keys and `back-control`'s reads of `previous` are covered.
5. A test can name the callout on a composed surface the way it names a dialog title.
6. `apps/desktop` can render a component in a test.
7. Rendering `startup-unreadable` outside its providers fails a test, and the message names the
   guard that was dropped.
8. A reader waiting on a record is told the record is on its way, in words about the record, in
   both locales, and the contract key and what the desktop supplies for it agree.
9. A phone number rendered under `dir="rtl"` is covered by a test, so the next surface that
   hand-rolls one is caught before a locale is opened.

# Acceptance Criteria

1. `svelte/no-navigation-without-resolve` reports on `packages/design/src/**`, or a rule records
   that it does not and why.
2. The two `eslint-disable` directives eslint reports as unused resolve one way or the other:
   they suppress a rule that fires, or they go. `pnpm lint` reports zero warnings.
3. A component test in `packages/design` renders a subject importing `$app/navigation` without
   the run failing to resolve it. Whatever supplies `$app/*` is scaffolding under
   `packages/design/src/tests/`, reachable by no consumer, and `[[rules/testing]]` records the
   arrangement.
4. Tests cover what `record-surface` says while the record is on its way and where there is no
   such record, and `back-control`'s reads of `previous`.
5. `packages/design/src/lib/primitive/callout/callout.svelte` renders `data-slot="callout"` on
   its root, as every other primitive family does, and the two block tests that anchor on its
   shape ask for the slot instead. The comments explaining why they could not go with the
   workaround.
6. `apps/desktop` can render a component in a test, following `packages/design/vitest.config.js`
   and its `.svelte.test.ts` convention, with the split governed by `[[rules/testing]]`.
7. A test renders `startup-unreadable` with no `DesignProvider` and no `TooltipProvider` above
   it, as `+layout.svelte` does, and it passes. Removing `tooltip={false}` from either call site
   makes it fail, and the failure names the provider rather than surfacing as an unrelated
   render error. Giving `StandaloneSurface` a `busy`, or a tone other than `error`, fails the
   same way.
8. A record surface that is still loading renders a sentence about the record rather than about
   the application, in both locales, and the contract key and what the desktop supplies for it
   agree, so a second consumer reading the docstring supplies the same kind of sentence.
9. A component test renders `Cell.Phone` under `dir="rtl"` and asserts that the country code
   leads. It runs on the harness criterion 6 builds rather than on a second one.
10. `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass.

# Constraints

- **The package may import `$app/*`, and that is settled.** It is answered in
  `[[efforts/773-the-design-system-becomes-a-package/spec]]` under Open Questions, and it is an
  acceptance criterion of #781. This effort makes the runner agree with the decision; it does
  not reopen it.
- **Nothing added for the tests may reach a consumer.** The package's `exports` map is an
  identity wildcard over `src/lib/`, so a stub written there is public. `src/tests/` is not.
- **`data-slot="callout"` is the convention, not an addition.** Check what the other families
  spell it as before writing it, so the callout joins them rather than starting a second
  spelling.
- **Do not delete the two `eslint-disable` directives to clear the warnings.** Both are live
  surface: `back.svelte.ts` calls `goto`, and `button.svelte` renders anchors. Removing them
  clears the signal without closing the gap.
- **Decide whether the loading sentence is the contract's or the caller's before writing
  either.** `record-surface` is shared by every concept, so one contract key cannot name the
  record's kind. A per-concept sentence is a prop; a sentence that works for any record is a
  key. `[[rules/frontend]]` under the packaged-component rules has the test.
- **The lint fix stays narrow.** The gap is one rule scoped to one project, not the plugin.

# Out of Scope

- **Backfilling tests for the other 37 primitive families.** This effort makes them testable and
  covers the four subjects named above. A coverage campaign is its own decision.
- **The eight families whose contract read happens inside a `*-Content` that bits-ui
  instantiates only on open.** Their throw surfaces on first interaction rather than at render,
  so a render-time test does not reach them. Named here so the gap is on the record.
- **Moving `Cell.Phone` or anything else across the boundary.** #807 settled what is in the
  package. Criterion 9 tests it where it lives, in `apps/desktop`, and that is the point of
  putting it behind criterion 6 rather than criterion 3.
- **The other numbers #810 left alone.** That effort fixed two surfaces and declined a general
  audit. Criterion 9 inherits the same line: it holds the phone rule shut, not every number the
  application renders.

# Assumptions

- The vitest configuration in `packages/design` is a shape the desktop can follow rather than
  one that has to be redesigned for a SvelteKit application.

# Open Questions

- **Is the loading sentence a prop or a contract key?** ~~The constraint above has the test to
  apply. The answer belongs in this spec before criterion 8 is built, not during it.~~
  **Answered 2026-08-27, before ticket 03 was built: it is a contract key, and it stays where it
  is.** `[[rules/frontend]]`'s test is *who knows the words*, and the words wanted here are that a
  record is on its way. `record-surface` is the thing that knows it is in the loading state, and
  the sentence is true of any record, so the package knows it. What the package cannot know is
  which **kind** of record, and requirement 8 does not ask for the kind: it asks for words about
  the record rather than about the application. Criterion 8 settles the same way from the other
  end, since *the contract key and what the desktop supplies for it agree* presupposes there is
  still a key to agree with.

  So the desktop supplies `common.messages.loadingRecord`, `loading record...` and
  `جاري تحميل السجل...`, in place of `loadingApp()`. **A per-concept sentence remains available and is a
  prop when somebody wants one** — `loadingTenant` already exists and is what such a prop would be
  handed. Nothing here forecloses that; it establishes what the surface says when no caller has an
  opinion, which is the case every record page is in today.

# Risks

- **A second component runner in the repository is a second thing to keep working.** The
  mitigation is that the desktop's follows the package's rather than being designed fresh, and
  `[[rules/testing]]` records which is which.
- **Criterion 1's escape hatch is the easy one to take.** Recording that the rule does not apply
  is a legitimate answer and also the answer that requires no work, so a run that reaches for it
  first has not tested whether the rule can be made to apply.
