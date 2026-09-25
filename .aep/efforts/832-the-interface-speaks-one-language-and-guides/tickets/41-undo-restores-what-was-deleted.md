---
status: resolved
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

- [x] The inverse of `contract.delete` and of `contract.deleteMany` restores each contract with
      its original status and its `contract_unit` rows in one batch, and reconciles, without the
      create path's status derivation or assignability check. Router tests: delete and undo a
      terminated contract holding a unit (it comes back terminated, the unit's status as before),
      and the same after another contract has taken that unit over an overlapping term (the undo
      succeeds and leaves the other contract's hold untouched). Verified: `contract.restoreMany` replaces the create path for both delete undos, restoring status and `contract_unit` rows in one batch, then reconciling; router tests A (terminated contract with a unit comes back terminated) and B (after another contract took the unit, the undo succeeds and leaves its hold) failed first ('active' !== 'terminated', `contract.unitsTaken`) and pass; desktop node 1199 of 1199 on the merged tree.
- [x] `useCreateContract`'s inverse is the single `contract.delete`; redo still recreates both. Verified: `useCreateContract`'s undo is the single `contract.delete` (recorded calls equal `['contract.delete']`, failing with the old two calls); redo recreates both; the renew undo was made the same single delete at integration; undo and router tests pass 134 of 134.
- [x] The import dialog raises a failure once: either its own toast or the shared handler, not
      both, for a permission failure and an unexpected one. Test. Verified: `useImportRecords` no longer raises failures so the dialog's toast is the only one; `workspace/tests/import-toast.test.ts` failed first ('FORBIDDEN was said 2 times') and passes.
- [x] `[[rules/data]]` *Undo* states that an undo restores rows rather than re-running a create.
 Verified: `rules/data.md` *Undo* says an undo restores rows rather than re-running a create.
## Relevant areas

- `apps/desktop/src/lib/contract/router.ts` (create, createMany, delete, deleteMany),
  `contract/query.ts`, `contract/contract.ts`, `workspace/query.ts`,
  `workspace/component/directory-import-dialog.svelte`, `.aep/rules/data.md`

## Constraints

- `[[rules/data]]` *Multi-table writes*, *Undo* and *Reconcile scope* bind the procedure.
