---
status: resolved
blocked-by: [08, 18, 19]
---

# feat(contract): a contract is created with its units

## Outcome

The contract form chooses the tenant and the units, and one submission creates the contract and
assigns its units in one write. The units offered are the ones free for the form's term, before
the contract exists. Undo removes both. The units tab stays for later changes, and the interface
rule says so.

## Acceptance Criteria

Traces requirement 20 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criteria 20(a) and 20(b).

- [x] `ContractCreateSchema` takes `unitIds` (default empty). `create` checks
      `ensureUnitsAssignable` against the proposed term, then inserts the contract and its
      `contract_unit` rows in one `ctx.db.batch` and reconciles `{ contractIds, unitIds }`, as
      `renew` does (`router.ts:579`). Verified: `ContractCreateSchema` takes `unitIds` (default empty); `create` checks `ensureUnitsAssignable` then writes the contract and its `contract_unit` rows in one `ctx.db.batch` and reconciles contracts and units; the router test's spy saw one batch with one contract and two unit inserts.
- [x] `units.getAssignableForTerm({ start, end, search? })` answers the form before a contract
      exists, with the same conflict rule as `getAssignableMany`. Verified: `units.getAssignableForTerm` shares the conflict helper with `getAssignableMany`; two router tests cover held, free, differently-termed and terminated holders, and search.
- [x] `useCreateContract` touches contracts and units. Its inverse clears the units and then deletes,
      and redo recreates both, as `useRenewContract` does. Verified: `useCreateContract` touches contracts and units; undo clears units then deletes, redo recreates both; `api/tests/undo.test.ts` failed on the old hook (`contract.holdsUnits`) and passes now.
- [x] The form gains a units field drawn with the field-kind map's control for choosing other
      records, and a refusal on overlap maps to that field by code. Verified: the form gains a multi-pick units combobox fed by `getAssignableForTerm` on create; `contract.unitsTaken` maps to `unitIds` (`refusal.test.ts`), en and ar sentences; merged with 21's `onCreated` so the created contract still opens; `pnpm check` 0 errors.
- [x] Router tests: create with units in one batch, refusal on an overlapping unit, and undo
      leaving neither. Verified: router tests for create in one batch, refusal on an overlapping unit leaving the list unchanged, and undo leaving neither; desktop node 1142 of 1142 on the merged tree.
- [x] `[[rules/interface]]` *Contract unit transfer* says units are chosen on create and changed on
      the tab.
 Verified: `rules/interface.md` *Contract unit transfer* says units are chosen on create and changed on the tab.
## Relevant areas

- `apps/desktop/src/lib/contract/router.ts:67,416,542,579,1224,1292`, `contract/contract.ts:570`,
  `contract/reconcile.ts:33,128`, `contract/query.ts:205,239,542`,
  `contract/component/form.svelte`, `contract/unit-transfer.ts`

## Constraints

- `[[rules/data]]` *Multi-table writes*, *Undo*, *Reconcile scope*, and `[[rules/api-layer]]`
  *Writes* (reconcile, autosync) bind the procedure.
