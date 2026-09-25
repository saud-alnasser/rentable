---
status: resolved
blocked-by: [10]
---

# feat(desktop): forms take one weight per concept, and each field its control

## Outcome

A concept's form weight follows the plan's rule and holds for create and edit, so the complex is
heavy for both. Each field takes the control the field-kind map gives it: the contract's cycle is a
toggle group, money is an input group with the riyal sign, and a setting that applies at once is a
switch. Submitting an invalid form focuses its first invalid field. Submits are labelled with
their verb and follow one icon convention.

## Acceptance Criteria

Traces requirements 6, 10 and 15 of
[[efforts/832-the-interface-speaks-one-language-and-guides/spec]], and its criteria 10 and 15.

- [x] `[[rules/interface]]` *Form surface* carries the weight rule, and a new *Field kinds* section
      carries the plan's map. Verified: `rules/interface.md` *Form surface* carries the weight rule, submit convention and focus-on-error; a new *Field kinds* section carries the plan's map (grep).
- [x] `complex/component/form.svelte:118` takes heavy for both create and edit. Verified: `complex/component/form.svelte` takes `weight=\"heavy\"` for create and edit (grep).
- [x] The contract cycle is a toggle group. Cost and payment amount use the input group with the
      riyal sign and `inputmode="decimal"`. The payment date picker takes the controlled open state
      and collision padding the contract pickers have. Verified: the contract cycle is `ToggleGroup.Root`; cost and payment amount are `InputGroup` with the riyal addon and `inputmode=\"decimal\"`; the payment picker binds `open` and sets `collisionPadding={16}`; `pnpm check` 0 errors in both packages on the merged tree.
- [x] A component test submits an invalid tenant form and asserts focus on its first invalid field. Verified: `tenant/tests/form.svelte.test.ts` submits an invalid tenant form and asserts focus on national id, failing with `autoFocusOnError` off; desktop vitest 269 of 269 on the merged tree.
- [x] Every submit carries its verb, with icons on all or none, as the rule states.
 Verified: all 21 desktop submits carry their verb and a glyph (grep), icons on all per the rule.
## Relevant areas

- `packages/design/src/lib/block/form-surface.svelte`, `primitive/toggle-group/*`,
  `primitive/input-group/*`, `primitive/switch/*`
- `apps/desktop/src/lib/{tenant,complex,contract,payment}/component/form.svelte`,
  `complex/component/unit-form.svelte`, the organization forms

## Constraints

- The plan's *Technical Approach* holds the weight rule and the map. Do not re-derive them.
