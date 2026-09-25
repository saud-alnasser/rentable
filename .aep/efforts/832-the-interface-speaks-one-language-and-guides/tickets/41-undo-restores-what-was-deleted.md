---
status: open
---

# fix(contract): undoing a delete restores exactly what was deleted

## Outcome

Undoing a contract's delete puts back the contract as it was, its status included, holding the
same unit assignments it held, without asking whether those units are free today: the undo
restores rows, it does not make a new contract. A contract's create undo is one delete, now that
delete releases the units itself. An import refused for permission says so once. Found by review
round 2 (correctness finding 1, the question on the create undo, and finding 2).

## Acceptance Criteria

Traces requirement 11 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 11(a).

- [ ] The inverse of `contract.delete` and of `contract.deleteMany` restores each contract with
      its original status and its `contract_unit` rows in one batch, and reconciles, without the
      create path's status derivation or assignability check. Router tests: delete and undo a
      terminated contract holding a unit (it comes back terminated, the unit's status as before),
      and the same after another contract has taken that unit over an overlapping term (the undo
      succeeds and leaves the other contract's hold untouched).
- [ ] `useCreateContract`'s inverse is the single `contract.delete`; redo still recreates both.
- [ ] The import dialog raises a failure once: either its own toast or the shared handler, not
      both, for a permission failure and an unexpected one. Test.
- [ ] `[[rules/data]]` *Undo* states that an undo restores rows rather than re-running a create.

## Relevant areas

- `apps/desktop/src/lib/contract/router.ts` (create, createMany, delete, deleteMany),
  `contract/query.ts`, `contract/contract.ts`, `workspace/query.ts`,
  `workspace/component/directory-import-dialog.svelte`, `.aep/rules/data.md`

## Constraints

- `[[rules/data]]` *Multi-table writes*, *Undo* and *Reconcile scope* bind the procedure.
