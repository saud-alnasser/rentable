---
status: resolved
---

# feat(contract): payments cover cycles oldest first

## Outcome

A pure function in the contract domain lays a contract's period out as cycles and takes its payments
against them oldest first, returning each cycle's due date, amount, covered amount and state, and
which cycles each payment covers. Nothing renders it yet; every later ticket reads it.

## Acceptance Criteria

Traces requirement 6 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and its
criteria 5 and 6.

- [x] `scheduleContract(contract, payments, now)` in `contract/schedule.ts` returns one cycle per
      cycle of the period, due on the start date and on the first day of each following interval
      (criterion 5, pure test on a twelve-month quarterly contract).
- [x] States follow requirement 6, and both cases of criterion 6(b) pass as written.
- [x] A terminated contract yields no `late` and no `due` cycle (criterion 6(c)).
- [x] A sweep over generated contracts and payments finds the uncovered sum of `late` and `due`
      cycles equal to `getOutstandingExpectedAmount` for every non-terminated contract, to the
      domain's tolerance (criterion 6(a)).
- [x] For a payment spanning two cycles, the coverage names both (feeds criterion 9(d)).
- [x] Nothing it produces is stored: this commit makes no schema change (criterion 6(d)).

## Relevant areas

- `apps/desktop/src/lib/contract/contract.ts` (`getContractCycleStartDate`,
  `getContractCycleCountForPeriod`, `countExpectedPayments`, `getContractTotalCost`, `EPSILON`)
- `apps/desktop/src/lib/payment/payment.ts` (`PaymentLike`, `getPaidAmount`)
- `apps/desktop/src/lib/contract/tests/`

## Constraints

- The shape and the sort order are [[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]],
  *Components*, `contract/schedule.ts`: payments by date, then by id (UUIDv7 is recording order).
- `EPSILON` and `ContractLike` are exported from `contract.ts` rather than restated.
- Whole UTC days, through `toUtcDay`.

## Notes

[[contexts/desktop/contract]] gains *Schedule* and *Allocation* in its language in this commit.
