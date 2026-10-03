---
status: resolved
---

# feat(desktop): the ledger says how each payment was made

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Ledger rows become two lines as the plan's *The ledger* gives them, with a glyph per method, and the method labels move into one shared map used by the ledger, the payment's details and its form.

## Acceptance Criteria

Traces requirement 20 and criterion 20.

- [x] A payment with method, reference and note shows all three, with the method's glyph and word; one without shows date and amount alone. *Verified: `npx vitest run src/lib/payment` printed 8 files, 41 tests passed; the new ledger test finds the method word, its aria-hidden svg, the ltr reference and the note, and a bare row with no `[data-payment-how]` and no svg.*
- [x] Month headers and totals are unchanged; the period filter and sort still pass. *Verified: the same test finds two month-total headers for two months; `node --test payment/tests/router.test.ts selection/tests/router.test.ts` printed pass 35, fail 0.*
- [x] `payment/component/details.svelte` and `form.svelte` read the shared map; no second copy remains. *Verified: `grep -rnE 'methods\.(cash|bankTransfer|cheque|ejar)|methodLabel =' src` outside i18n and tests finds only `payment/method.ts`; details, form and receipt import it.*

## Relevant areas

- `apps/desktop/src/lib/payment/component/{ledger,details,form}.svelte`, `apps/desktop/src/lib/payment/`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
