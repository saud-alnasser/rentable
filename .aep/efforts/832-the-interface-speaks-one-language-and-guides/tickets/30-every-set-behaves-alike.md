---
status: resolved
---

# fix(desktop): every set and every missing page behaves alike

## Outcome

Every list sorts, the unit directory and the payment ledger included. The contract's units pane
looks and acts like every other list: the shared search field, and cards with their menu. An empty
set whose create act is unavailable shows it disabled with the same reason the toolbar gives,
never an enabled button. A missing record and an unknown route are one treatment with one way
back. The members toolbar orders its controls as every other toolbar does, and its description is
muted like every other.

## Acceptance Criteria

Traces requirements 6, 7, 13 and 16 of
[[efforts/832-the-interface-speaks-one-language-and-guides/spec]], and its criteria 7, 13 and 16.
Found by the walk of ticket 27 (findings 6, 7, 10 and 12) and by the [DIFF] "the unit directory
and the payment ledger have no sort".

- [x] The unit directory and the payment ledger pass `sortOptions`. Component test on each. Verified: the unit directory and the payment ledger pass `sortOptions`, with sort on both routers; `ledger.svelte.test.ts` and `unit-directory.svelte.test.ts` pass; desktop node 1172 of 1172 on the merged tree.
- [x] The contract units pane uses the shared search field and draws its units as record cards with
      their acts. Component test asserts the field's icon, debounce and `/`. Verified: the units pane uses the shared search field and draws its units as record cards with the unit's acts; `contract/tests/units.svelte.test.ts` passes 5 of 5 on the merged tree (its label assertion now reads 28's title-cased menu).
- [x] An empty state's create act takes the create act's `unavailable` reason: disabled, with the
      reason, when the toolbar's is. Component test on a terminated contract's payments. Verified: the empty state's create takes the create act's `unavailable` reason, disabled with the reason in a tooltip and to assistive tech, and keeps 28's concept label; the terminated-contract test in `ledger.svelte.test.ts` passes.
- [x] Not-found and the unknown route share one block and one back control. Component test on both. Verified: the new `block/not-found.svelte` serves the record surface and `+error.svelte` with one back control; `not-found.svelte.test.ts`, `record-surface.svelte.test.ts` and `layout/tests/unknown-route.svelte.test.ts` pass (design vitest 113 of 113).
- [x] The members and workspaces toolbars order search, count, sort, select and create as the list
      shell does, and their descriptions use the muted tone.
 Verified: the members and workspaces toolbars follow the list shell's order and their descriptions are muted; `design/tests/set-bar.svelte.test.ts` and the members, workspaces and standing tests pass.
## Relevant areas

- `complex/component/unit-directory.svelte`, `payment/component/ledger.svelte`,
  `contract/component/units.svelte`, `block/empty.svelte`, `routes/+error.svelte`,
  `packages/design/src/lib/block/record-surface.svelte`, `organization/component/directory-tray.svelte`
