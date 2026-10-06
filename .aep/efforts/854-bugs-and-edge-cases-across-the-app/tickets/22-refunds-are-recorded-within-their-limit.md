---
status: resolved
blocked-by: [21]
---

# feat(desktop): refunds are recorded within their limit

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *The limit (req 26)*).

## Outcome

A refund can be created, edited and deleted through the payment procedures on any contract within its state's limit, a terminated one included; received payments on a terminated contract stay locked; every write keeps refunds within what was received.

## Acceptance Criteria

Traces requirements 25 and 26, and criteria 25 and 26.

- [x] `payment.create` accepts a direction; update, delete, plan, deleteMany and createMany follow the plan's table; refusals `contract.refundAboveLimit` and `contract.refundsExceedReceived` and reason `refunds-exceed-received`.
- [x] Router and selection tests per criteria 25 and 26 (the router half), including restoring a refunded terminated contract going through and owing.

## Relevant areas

- `apps/desktop/src/lib/payment/{router.ts,payment.ts,refusal.ts,selection/router.ts}`
- `apps/desktop/src/lib/contract/{contract.ts,refusal.ts}`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
