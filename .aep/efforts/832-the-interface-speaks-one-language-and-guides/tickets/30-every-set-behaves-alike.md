---
status: open
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

- [ ] The unit directory and the payment ledger pass `sortOptions`. Component test on each.
- [ ] The contract units pane uses the shared search field and draws its units as record cards with
      their acts. Component test asserts the field's icon, debounce and `/`.
- [ ] An empty state's create act takes the create act's `unavailable` reason: disabled, with the
      reason, when the toolbar's is. Component test on a terminated contract's payments.
- [ ] Not-found and the unknown route share one block and one back control. Component test on both.
- [ ] The members and workspaces toolbars order search, count, sort, select and create as the list
      shell does, and their descriptions use the muted tone.

## Relevant areas

- `complex/component/unit-directory.svelte`, `payment/component/ledger.svelte`,
  `contract/component/units.svelte`, `block/empty.svelte`, `routes/+error.svelte`,
  `packages/design/src/lib/block/record-surface.svelte`, `organization/component/directory-tray.svelte`
