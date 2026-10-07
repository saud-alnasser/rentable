---
status: resolved
---

# fix(desktop): a refund is judged by one rule wherever it is written

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 1 (2026-10-07).

## Outcome

Whether a payment may be written is decided in the payment and contract modules, never inline in a procedure, and every path that writes a refund (record, edit, delete, undo of one or of many, import) agrees with it; lowering a refund is never refused, and a state the app reaches on its own always exports and imports back.

## Acceptance Criteria

Traces requirements 25, 26 and 30, and criteria 25, 26 and 30.

- [x] The rule that a refund escapes the terminated lock, and the limit check, live in one domain function the payment procedures ask (`rules/api-layer`, *Where things live*); `payment.delete` no longer restates it inline.
- [x] `payments.createMany` (the undo of a bulk deletion) checks returning refunds against the limit as `payment.create` does, so both undo paths agree; a router test reproduces the reviewer's case (cost 12,000, received 13,000, refund deleted in bulk, another refund recorded, the undo refused).
- [x] Editing a refund to a smaller amount is never refused, even where the contract already holds refunds past its limit (a restored contract); raising it past the limit still is; a router test covers both on a restored contract.
- [x] `transfer/tests/round-trip.test.ts` round-trips a contract that received 5,000, was terminated, refunded 3,000 and restored, and gets it back owing; the duplicate act on a terminated contract and the edit refusal read the same sentence, and the form's zero-limit reason comes from the same choice the act makes.

## Relevant areas

- `apps/desktop/src/lib/payment/{payment.ts,router.ts,acts.ts}`
- `apps/desktop/src/lib/payment/selection/router.ts`
- `apps/desktop/src/lib/payment/component/form.svelte`
- `apps/desktop/src/lib/contract/contract.ts`
- `apps/desktop/src/lib/transfer/tests/round-trip.test.ts`

## Constraints

- A changeset only where a user observes something no entry of this effort already says; otherwise extend nothing and say so in Notes ([[references/changesets]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
