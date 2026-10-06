---
status: resolved
blocked-by: [07, 08]
---

# fix(desktop): contract import keeps terminated contracts and never double-books a unit

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R5* and its decision).

## Outcome

Importing contracts honours an exported terminated status, writing the contract's payments before the status lands, and refuses in the plan (naming the row) and in the write any row that names a unit twice, overlaps another row on a unit, or takes a unit a live contract holds.

## Acceptance Criteria

Traces requirements 5 and 30, and criterion 5.

- [x] The contract sheet reads `Status` and honours `terminated`; a whole-workspace import applies it after the payments are written; a payments-only file onto an already-terminated held contract is still refused.
- [x] A repeated unit in one row is `invalid`; overlaps are found through the optional sheet `claims` member and `transfer.held`; the write refuses with `contract.unitRepeatedNamed` or `contract.unitsTakenNamed`.
- [x] Tests per criterion 5, each asserting no `contract_unit` row written; a test imports a terminated contract with payments and finds it terminated with its payments.
- [x] [[contexts/desktop/contract]] says transfer keeps terminated contracts.

## Relevant areas

- `apps/desktop/src/lib/transfer/{sheet.ts,transfer.ts,router.ts}`
- `apps/desktop/src/lib/contract/transfer.ts`
- `apps/desktop/src/lib/payment/transfer.ts`

## Constraints

- Terminated rows are left out of claims.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
