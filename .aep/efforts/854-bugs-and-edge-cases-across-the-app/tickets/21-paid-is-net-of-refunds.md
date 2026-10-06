---
status: open
blocked-by: [20]
---

# feat(desktop): what a contract counts as paid is net of refunds

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Net paid through every figure*).

## Outcome

Every figure that sums a contract's payments reads received less refunded: paid amount, status, schedule and allocation (refunds take cover from the newest covered cycle back), outstanding, paid in full, the directory row, and the receipt's remaining.

## Acceptance Criteria

Traces requirement 27 and criterion 27.

- [ ] `getReceivedAmount`, `getRefundedAmount`, net `getPaidAmount`, `getRefundableAmount` in `contract/contract.ts`.
- [ ] Allocation in `schedule.ts`, the receipt's running total, and the directory `paymentCount` follow the plan.
- [ ] Tests per criterion 27, with refunds seeded directly.
- [ ] [[contexts/desktop/contract]] gains Refund and Voucher, and Paid reads net.

## Relevant areas

- `apps/desktop/src/lib/contract/{contract.ts,schedule/schedule.ts,directory/router.ts}`
- `apps/desktop/src/lib/payment/receipt.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
