---
status: resolved
blocked-by: [10]
---

# feat(desktop): navigation holds

## Outcome

The breadcrumb links only to routes that exist and names the record it ends on. One back control
serves every surface, onboarding included. Record sections and settings sections switch with one
link-based control on `?section=`, so every section is addressable, a contract's history included.

## Acceptance Criteria

Traces requirements 6 and 14 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 14(a), 14(b) and 14(c).

- [x] `layout/navigation.ts` builds the trail from route ids, skipping `/complexes/units`,
      `/contracts/units` and `/contracts/payments`. Its last crumb names the record. A node test
      asserts every link target is a route. Verified: `layout/navigation.ts` builds the trail from `PAGE_ROUTES` (checked against `RouteId`), skips the three non-routes, and ends on the record named through `shown-record.svelte.ts`; `navigation.test.ts` checks targets against the routes folder; desktop node 1094 of 1094 on the merged tree.
- [x] `organization/component/back-glyph.svelte` is removed, and the onboarding screens use
      `block/back-control.svelte`. Verified: `back-glyph.svelte` is removed; `setup-walk` and `connect-screen` use `block/back-control.svelte` (gained `onclick`, `label`); organization vitest passes within desktop vitest 268 of 268.
- [x] `packages/design/src/lib/block/section-switch.svelte` replaces the record surface's `Tabs`
      plus `goto`, and the settings rail's `<nav>`. Component tests on a record and in settings. Verified: `block/section-switch.svelte` replaces the record surface's Tabs plus goto and the deleted `settings/component/rail.svelte`; `section-switch.svelte.test.ts` and `record-surface.svelte.test.ts` pass in design vitest 97 of 97, and the settings area switch test passes.
- [x] `routes/contracts/[id]/+page.svelte` reads every section, so `?section=history` opens
      history. A test asserts it. Verified: the contract page reads sections through `contract/section.ts`; `contract/tests/section.test.ts` asserts `?section=history` opens history.
- [x] `[[rules/interface]]` gains a *Navigation* section.
 Verified: `rules/interface.md` gains *Navigation*; the testing and frontend rules no longer say the record surface calls goto; validate.mjs no failures.
## Relevant areas

- `apps/desktop/src/lib/layout/navigation.ts:34`, `layout/component/breadcrumb.svelte`
- `packages/design/src/lib/block/record-surface.svelte:91-110`, `settings/component/rail.svelte`,
  `settings/section.ts`
- `organization/component/back-glyph.svelte`, `setup-walk.svelte`, `connect-screen.svelte`
- `routes/contracts/[id]/+page.svelte:6-7`
