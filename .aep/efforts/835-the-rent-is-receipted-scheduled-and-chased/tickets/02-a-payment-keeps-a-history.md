---
status: resolved
---

# feat(payment): a payment keeps a history

## Outcome

Recording, editing and deleting a single payment each write a history entry, as deleting several
already does, and a payment's record shows its history the way a contract's does.

## Acceptance Criteria

Traces requirement 4 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and its
criteria 4(b) and 4(c).

- [x] `useCreatePayment`, `useUpdatePayment` and `useDeletePayment` declare `records`, and their
      inverses `records(direction)`, writing `created`, `edited` and `deleted` through
      `toPaymentHistoryEntry`. Mutation tests show each appends through `api.history.append`, and
      that undoing an edit appends one.
- [x] The payment's record renders `RecordHistory concept="payment"`, newest first (component test
      on the payment record; criterion 4(b)).
- [x] Deleting one payment writes one entry (criterion 4(c)).

## Relevant areas

- `apps/desktop/src/lib/payment/query.ts` (`toPaymentHistoryEntry`, the three hooks, and
  `useDeleteManyPayments` as the existing pattern)
- `apps/desktop/src/lib/contract/query.ts` (`useUpdateContract`, the edit pattern)
- `apps/desktop/src/lib/payment/component/details.svelte` and
  `apps/desktop/src/lib/contract/component/details.svelte` (`RecordHistory`)

## Constraints

- The history table and its reads do not change ([[rules/data]], *Undo* and *Mutation declaration*).
