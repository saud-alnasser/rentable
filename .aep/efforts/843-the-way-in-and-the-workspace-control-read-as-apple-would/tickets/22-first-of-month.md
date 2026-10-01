---
status: resolved
blocked-by: []
---

# test(desktop): the period tests pass on the first of a month

## Outcome

The dashboard's and the payment ledger's period tests date their current-month payments on the
first of the month, which a payment may always be dated on, rather than on the second to fourth,
which on the first of a month are in the future and are refused as `payment.datedInFuture`. CI's
test phase failed on 2026-10-01 for that reason alone; the effort touched neither router.

## Acceptance Criteria

Traces requirement 14 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criterion 14, for the branch a human is asked to merge passing its checks.

- [x] Every current-month payment in `dashboard/tests/router.test.ts` and
      `payment/tests/router.test.ts` is dated `dayOf(0, 1)`. *Verified: a grep for `dayOf(0, ` finds
      no day after the first in either file.*
- [x] Both files pass on 2026-10-01. *Verified: `node --import tsx --test
      --experimental-test-module-mocks` over the two printed 59 pass, 0 fail.*
- [x] The node suite passes. *Verified: 1449 pass, 0 fail; `pnpm check` 0 errors; lint clean.*

## Relevant areas

- `apps/desktop/src/lib/dashboard/tests/router.test.ts`, `apps/desktop/src/lib/payment/tests/router.test.ts`

## Notes

*Appended 2026-10-01 when the merge-ready branch's CI failed its test phase, at the human's word:
"test phase of ci faild read the logs of ci and fix the issue". Tests only, so no changeset.*
