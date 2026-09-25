---
status: resolved
blocked-by: [13, 18]
---

# feat(desktop): the interface fills what it can and lands where the next step is

## Outcome

A field the application can fill is filled: a payment opens with today and the amount due. After
an act the user lands where the next step is: a created record opens or is brought into view, with
focus on its next act. An act that cannot run is shown disabled with a one-line reason on hover and
focus, instead of a paragraph.

## Acceptance Criteria

Traces requirement 16 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 16.

- [x] The payment form opens with today's date and the amount due this cycle, capped at what
      remains. A component test asserts both. Verified: `payment/tests/form.svelte.test.ts` fixes the clock and asserts today's date and the amount due (500 part-paid, 1000 at the cap); `getAmountDueThisCycle` node tests pass; desktop vitest 315 of 315 on the merged tree.
- [x] Creating a contract opens its record. Creating a tenant, complex or payment brings it into
      view in its set and focuses it. Checked by a component test on the contract host, and by hand
      in the walk for the rest. Verified: `contract/tests/landing.svelte.test.ts` asserts creating a contract navigates to its record; tenant, complex and payment hosts record the new id and the list scrolls to and focuses it after the dialog closes (by hand in the walk, ticket 27); `toPositionOf` node test passes.
- [x] `RecordAct.unavailable` renders as a disabled control with its reason in a tooltip, on every
      surface. The payments ledger's `fullyPaidNotice` and `terminatedNotice` paragraphs become the
      create act's reasons. Component test. Verified: `unavailable` renders `aria-disabled`, focusable, with its reason in a tooltip on the card, page cluster and create control (package and app tests); the palette shows the reason inline because focus stays in its field; the ledger's notices are the create act's reasons via `toPaymentCreateUnavailable` (`acts.test.ts`).
- [x] `[[rules/interface]]` gains a *Guidance* section.
 Verified: `rules/interface.md` gains *Guidance*; validate.mjs no failures.
## Relevant areas

- `apps/desktop/src/lib/payment/component/form.svelte`, `payment/component/ledger.svelte`
- the hosts' `create` resolution, `design/block/list.svelte` (scroll to and focus a record)
