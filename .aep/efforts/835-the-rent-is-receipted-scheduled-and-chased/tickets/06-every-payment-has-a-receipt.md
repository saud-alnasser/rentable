---
status: resolved
blocked-by: [01, 03, 05]
---

# feat(payment): every payment has a receipt

## Outcome

A *receipt* act on every payment prints a one-page receipt in Arabic and English through the print
sheet. It is assembled by a `payment.receipt` read and a pure receipt module.

## Acceptance Criteria

Traces requirements 8, 9 and 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]],
and its criteria 8, 9 and 10.

- [x] The act is offered on the payment's record, its ledger card and the palette, including on a
      terminated contract's payments (criterion 8, `design/tests/acts.test.ts`).
- [x] `payment.receipt({ id })` returns every fact requirement 9 lists, the covered cycles from
      ticket 01, and what remains of the total cost after this payment (router test).
- [x] The receipt reference is built as
      [[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *The receipt reference*,
      describes, and two ids a millisecond and a counter apart give different references
      (criterion 9(b), `payment/tests/receipt.test.ts`).
- [x] The Arabic block carries `lang="ar" dir="rtl"` and the English block `lang="en" dir="ltr"`.
      Method and reference are omitted, labels included, where not recorded. The issuer is the
      workspace's name (criteria 9(a) and 9(c), component test).
- [x] A payment covering the second cycle and part of the third names both (criterion 9(d)).

## Relevant areas

- `apps/desktop/src/lib/payment/acts.ts`, `host.svelte.ts`, `router.ts`
- new `payment/receipt.ts` and `payment/component/receipt.svelte`
- `apps/desktop/src/lib/i18n/i18n-util.ts` (`i18nObject`), `platform/locale.ts`
- `apps/desktop/src/lib/settings/query.ts` (the workspace name)

## Constraints

- No offer in the success toast (spec, *Out of Scope*).
- A receipt is not a tax invoice and says nothing that reads as one.

## Revised

The hand check of criterion 10 left this ticket on 2026-09-25, when the human revised requirement
10 after trying the first build: printing now goes through the application's own preview, and the
check is ticket 11's and ticket 10's.
