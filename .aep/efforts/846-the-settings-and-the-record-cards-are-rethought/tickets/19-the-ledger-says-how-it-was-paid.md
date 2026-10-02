---
status: open
---

# feat(desktop): the ledger says how each payment was made

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Ledger rows become two lines as the plan's *The ledger* gives them, with a glyph per method, and the method labels move into one shared map used by the ledger, the payment's details and its form.

## Acceptance Criteria

Traces requirement 20 and criterion 20.

- [ ] A payment with method, reference and note shows all three, with the method's glyph and word; one without shows date and amount alone.
- [ ] Month headers and totals are unchanged; the period filter and sort still pass.
- [ ] `payment/component/details.svelte` and `form.svelte` read the shared map; no second copy remains.

## Relevant areas

- `apps/desktop/src/lib/payment/component/{ledger,details,form}.svelte`, `apps/desktop/src/lib/payment/`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
