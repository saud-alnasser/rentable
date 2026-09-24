---
status: open
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

- [ ] The payment form opens with today's date and the amount due this cycle, capped at what
      remains. A component test asserts both.
- [ ] Creating a contract opens its record. Creating a tenant, complex or payment brings it into
      view in its set and focuses it. Checked by a component test on the contract host, and by hand
      in the walk for the rest.
- [ ] `RecordAct.unavailable` renders as a disabled control with its reason in a tooltip, on every
      surface. The payments ledger's `fullyPaidNotice` and `terminatedNotice` paragraphs become the
      create act's reasons. Component test.
- [ ] `[[rules/interface]]` gains a *Guidance* section.

## Relevant areas

- `apps/desktop/src/lib/payment/component/form.svelte`, `payment/component/ledger.svelte`
- the hosts' `create` resolution, `design/block/list.svelte` (scroll to and focus a record)
