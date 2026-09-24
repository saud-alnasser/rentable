---
status: open
---

# fix(contract): a contract with its units deletes at once, and every refusal is heard

## Outcome

A contract without payments deletes at once with its units released, and undo restores both, as
the create's own undo already does. No form swallows a refusal: a code a form cannot place on a
field is still said, through the shared handler. Duplicating a payment is refused on a contract
paid in full, as creating one is. A permission failure reads as its own sentence even where a
declaration turned the generic error toast off. A create's undo that fails halfway leaves the
screen true to what was written. Found by review round 1 (correctness findings 1, 2, 3 and 7).

## Acceptance Criteria

Traces requirements 11, 16 and 23 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 11(a), 16 and 23.

- [ ] `whatBlocksContractDeletion` no longer refuses a payment-free contract for its units;
      `contract.delete` removes its `contract_unit` rows and the contract in one batch and
      reconciles both; `useDeleteContract`'s inverse restores the contract and its units. Router
      test: create with units, delete, undo, and the contract holds the same units again.
- [ ] Each form's catch maps what it can to a field and hands every other refusal to the shared
      handler, so it is said in the reader's language; `payment.duplicate` is refused with the same
      reason as create on a contract paid in full. Component tests on the payment and tenant forms.
- [ ] `design/mutation.ts` shows a FORBIDDEN or UNAUTHORIZED failure's own sentence whether or not
      the declaration set `error: false`. Test.
- [ ] A multi-step inverse refreshes what it touched even when a later step fails. Test on the
      contract create's undo.

## Relevant areas

- `apps/desktop/src/lib/contract/contract.ts`, `contract/router.ts`, `contract/query.ts`,
  `contract/component/host.svelte`, `payment/component/form.svelte`, `payment/acts.ts`, the tenant,
  complex and unit forms, `design/mutation.ts`

## Constraints

- `[[rules/data]]` *Multi-table writes*, *Undo* and *Reconcile scope* bind the delete.
