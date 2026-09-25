---
status: resolved
blocked-by: [24]
---

# feat(contract): a contract starts from a tenant or a unit

## Outcome

A tenant's page and a unit's page each offer "new contract", opening the contract form with that
tenant or unit already chosen.

## Acceptance Criteria

Traces requirement 21 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 21.

- [x] The contract host's `create` takes `{ tenantId?, unitIds? }`. The tenant and unit acts lists
      gain "new contract", calling it with the record. Verified: `contractHost.create(prefill?)` takes `{ tenantId?, unitIds? }`; `tenant.newContract` and `unit.newContract` join the acts lists and call it with the record; `design/tests/acts.test.ts` asserts both, 51 pass; desktop node 1142 of 1142 on the merged tree.
- [x] Component tests: from a tenant's page the form opens with the tenant chosen, and from a
      unit's page with the unit chosen.
 Verified: `contract/tests/started-from-a-record.svelte.test.ts` renders the tenant and unit pages beside the contract host and asserts the form opens with the tenant, and with the unit and its complex, chosen: 2 pass; desktop vitest 317 of 317 on the merged tree.
## Relevant areas

- `apps/desktop/src/lib/contract/component/host.svelte`, `tenant/acts.ts`, the unit's acts,
  `tenant/component/contracts.svelte`, `complex/component/unit-contracts.svelte`
