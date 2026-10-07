---
status: resolved
---

# feat(desktop): a refund is a tab of the payment form, opened from the bar's plus

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Asked by the human on 2026-10-07, after checking the build.

## Outcome

A contract's payments keep the bar's one plus, and the payment form it opens has two tabs, a payment and a refund, each with its glyph pointing the way the money moves. The form opens on the payment where the contract takes one and on the refund where it does not; a tab the contract does not take is dimmed in place, says why on hover and focus, and cannot be chosen, so the form's create is never what is dimmed. The plus is refused only where neither may be made. The refund control on the ledger's balance footer is gone.

## Acceptance Criteria

Traces requirement 25 as amended, and criterion 25.

- [x] The payment form draws, for a new payment only, a toggle group of `payment` (`banknote-arrow-down`) and `refund` (`banknote-arrow-up`); choosing one starts its amount afresh (a payment filled with what is due, a refund empty); a tab the contract does not take is dimmed with the create act's reason and cannot be chosen, and the form stands on the other; an edit or a duplicate draws no tabs.
- [x] The host answers a create naming no kind by opening the form on the payment where the contract takes one, else on the refund, and refuses it only where neither is taken, with the payment's reason.
- [x] The ledger keeps one plus, refused only where neither kind may be made, and draws no refund control of its own.
- [x] Component tests: the tabs and their glyphs, the refused tab dimmed with its reason and choosing nothing, the form opened on the tab taken, a refund written from its tab, a payment filled with what is due, no tabs on an edit; the ledger's plus opens the form on a terminated contract with money and is refused where neither may be made.
- [x] [[rules/interface]] *Create* and [[contexts/desktop/components]] say what is true now and why.

## Relevant areas

- `apps/desktop/src/lib/payment/component/{form.svelte,host.svelte,ledger.svelte}`
- `apps/desktop/src/lib/payment/tests/{refund-form,form,ledger}.svelte.test.ts`

## Constraints

- The human, verbatim, first: "the refund button should be part of the action tray at the top with the search part and plus signt maybe since htis is a payment button it should show both optoins payment and refuend maybe it should and maybe use icon for plus icon similer to refuend bue the oppiste side in context to the used icon now for refuend".
- Then: "what i meant saprate buttons on the payment tray instead of just a plus and dropdown since the tray for actions".
- Then, which this ticket builds: "actuly i have a better solution the plus is returned and the two options become a two tabs inside the form instead".
- And: "the tab should be grayed out or a callout at top if this tab cannot refund/payment i'm not sure but the create button grayed out only it feels wrong find the best option".

## Notes

Built in `_run` as a wave of one. Two earlier shapes, a menu behind the plus and two buttons in the bar, were built and replaced within this ticket at the human's word; the create control and the list shell are as they were before it. The changeset `refunds-are-recorded-from-the-ledger.md` now says where the refund is recorded.

The human then asked that a tab the contract does not take be greyed out or explained, not only the create button: it is dimmed with its reason, as every refused control here, and cannot be chosen. A contract never takes both kinds at once (a live one refunds only past its total, a terminated one takes no payment), so one tab is always the dimmed one.

The human found the dimmed tab's reason open as the form opened: the toggle group makes its first tab the one the keyboard enters by, so the surface's opening focus landed on the payment tab whatever was chosen. The reason now opens on hover and on a focus the reader moved there, never on the opening focus; a component test opens the form and finds no reason, then hovers and moves to the tab and finds it.
