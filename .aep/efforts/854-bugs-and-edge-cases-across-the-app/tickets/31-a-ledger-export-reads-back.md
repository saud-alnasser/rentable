---
status: open
---

# fix(desktop): a contract's payments ledger exported to a file imports back

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

A ledger exported from a contract's page names its contract by the reference the import resolves, so it reads back for a contract with no government number too.

## Acceptance Criteria

Traces requirement 30 (the human: importing and exporting give back the same state, no defects).

- [ ] The ledger's Contract cell writes the contract's transfer reference (`toContractReferences`), which a contract with a government number reads as that number, as today.
- [ ] `payment/tests/ledger-export.test.ts` exports the ledger of a contract with no government number and imports it into the workspace it came from, getting every field back; the doc comment on `paymentLedgerColumns` and the test header state only what is true.

## Relevant areas

- `apps/desktop/src/lib/payment/ledger.ts`
- `apps/desktop/src/lib/payment/component/ledger.svelte`
- `apps/desktop/src/lib/transfer/reference.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
