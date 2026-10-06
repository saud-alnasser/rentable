---
status: open
blocked-by: [22, 24]
---

# feat(desktop): a refund prints a payment voucher

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Voucher (req 29)*).

## Outcome

A refund prints a payment voucher (سند صرف) from the receipt's print preview, in Arabic or English, with every field the spec names; a payment's receipt is unchanged.

## Acceptance Criteria

Traces requirement 29 and criterion 29.

- [ ] `payment.receipt` answers a voucher for a refund; `voucher.svelte` renders it through the same print path.
- [ ] Tests per criterion 29 in both languages; existing receipt tests unchanged.

## Relevant areas

- `apps/desktop/src/lib/payment/{router.ts,receipt.ts,component/host.svelte,component/voucher.svelte}`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
