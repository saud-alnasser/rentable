---
status: open
blocked-by: [24]
---

# feat(contract): a contract starts from a tenant or a unit

## Outcome

A tenant's page and a unit's page each offer "new contract", opening the contract form with that
tenant or unit already chosen.

## Acceptance Criteria

Traces requirement 21 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 21.

- [ ] The contract host's `create` takes `{ tenantId?, unitIds? }`. The tenant and unit acts lists
      gain "new contract", calling it with the record.
- [ ] Component tests: from a tenant's page the form opens with the tenant chosen, and from a
      unit's page with the unit chosen.

## Relevant areas

- `apps/desktop/src/lib/contract/component/host.svelte`, `tenant/acts.ts`, the unit's acts,
  `tenant/component/contracts.svelte`, `complex/component/unit-contracts.svelte`
