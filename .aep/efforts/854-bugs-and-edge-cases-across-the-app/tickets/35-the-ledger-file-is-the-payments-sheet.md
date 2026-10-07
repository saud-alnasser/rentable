---
status: resolved
---

# fix(desktop): a contract's ledger file is written by the payments sheet

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 1 (2026-10-07).

## Outcome

A contract's ledger export is written by the columns the payments sheet owns, with one sign rule for a refund, and names its tenant.

## Acceptance Criteria

Traces requirement 30 and criterion 30.

- [x] The ledger's export columns live in `payment/transfer.ts` beside the sheet's (`rules/module-layout`), reusing its `toSignedAmount`; `payment/ledger.ts` no longer holds a column definition.
- [x] The ledger export's Tenant cell and file name carry the contract's tenant (the contract read gives the ledger what it needs), and `payment/tests/ledger-export.test.ts` checks the tenant is written and the file still reads back.

## Relevant areas

- `apps/desktop/src/lib/payment/{transfer.ts,ledger.ts}`
- `apps/desktop/src/lib/payment/component/ledger.svelte`
- `apps/desktop/src/lib/contract/router.ts`

## Constraints

- A changeset only where a user observes something no entry of this effort already says; otherwise extend nothing and say so in Notes ([[references/changesets]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
