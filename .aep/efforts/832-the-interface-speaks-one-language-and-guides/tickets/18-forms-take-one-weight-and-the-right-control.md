---
status: open
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

- [ ] `[[rules/interface]]` *Form surface* carries the weight rule, and a new *Field kinds* section
      carries the plan's map.
- [ ] `complex/component/form.svelte:118` takes heavy for both create and edit.
- [ ] The contract cycle is a toggle group. Cost and payment amount use the input group with the
      riyal sign and `inputmode="decimal"`. The payment date picker takes the controlled open state
      and collision padding the contract pickers have.
- [ ] A component test submits an invalid tenant form and asserts focus on its first invalid field.
- [ ] Every submit carries its verb, with icons on all or none, as the rule states.

## Relevant areas

- `packages/design/src/lib/block/form-surface.svelte`, `primitive/toggle-group/*`,
  `primitive/input-group/*`, `primitive/switch/*`
- `apps/desktop/src/lib/{tenant,complex,contract,payment}/component/form.svelte`,
  `complex/component/unit-form.svelte`, the organization forms

## Constraints

- The plan's *Technical Approach* holds the weight rule and the map. Do not re-derive them.
