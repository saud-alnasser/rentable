---
status: open
blocked-by: [01]
---

# fix(desktop): undo refuses what is gone and redo remembers what it removed

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R8*, *R9*, *R24*).

## Outcome

Undoing a creation whose record was deleted elsewhere fails visibly and can never recreate it; a bulk deletion's redo remembers only what it actually deleted; undoing the creation of a complex with no units does not ask for the unit-deletion permission.

## Acceptance Criteria

Traces requirements 8, 9 and 24, and criteria 8, 9 and 24.

- [ ] `complex.units.delete`, `complex.delete`, `contract.delete` and `payment.delete` refuse a missing row with their existing keys, as `tenant.delete` does.
- [ ] The bulk-delete declarations for tenants, units, payments, contracts (and the complex `records`) keep what the last redo removed; an undo after a redo that removed nothing does nothing.
- [ ] `useCreateComplex`'s undo asks for `deleteUnit` only when the complex has units.
- [ ] `api/tests/undo.test.ts` covers criterion 8 for units, contracts, renewals, payments and complexes; criterion 9 for each bulk kind; criterion 24 both ways. Each router gains "deleting a missing record is refused".

## Relevant areas

- `apps/desktop/src/lib/{complex,complex/unit,contract,payment}/router.ts`
- `apps/desktop/src/lib/{tenant,complex,complex/unit,payment,contract/selection}/query.ts`
- `apps/desktop/src/lib/api/tests/undo.test.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
