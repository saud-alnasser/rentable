---
owner: repository
status: accepted
load-when: a record card or list row is given an action
sources: [src/lib/design/block/record-card.svelte, src/lib/design/block/list.svelte]
supersedes: [0033-a-record-cards-actions-are-a-context-menu.md]
superseded-by: []
---

# A record card carries its actions twice, and one block owns both routes

[ADR 0033](0033-a-record-cards-actions-are-a-context-menu.md) made a card's actions a context
menu alone, on the grounds that a directory card is too full to carry a control and that every
entry is redundant with a control on the record's own page. Both grounds turned out to be
wrong in the tree: a complex's units and a contract's payments already carry a visible menu
button on cards no less full, and a unit's own page carries neither edit nor delete, so the
unit card's actions were redundant with nothing. **A record card now offers its actions from a
visible tertiary control on the card *and* from the platform's context gesture, everywhere, and
one block owns the card's markup so a surface inherits both instead of choosing.**

**The two routes are not equals, and the asymmetry is the rule.** The visible control is what
the card promises: every action a card offers is reachable there, by pointer and by keyboard.
The gesture is derived from the same list and may hold nothing the control does not — it is an
accelerator for a reader working down a list, kept because a desktop application on Windows is
where right-click is the platform's own gesture for a record's actions, and because nothing in
this repository claims that gesture otherwise. Where the two would diverge, the gesture goes and
the control never does.

## Considered Options

- **The context menu alone**, as ADR 0033 decided. Leaves the card quiet, and made the actions
  unreachable without a pointer — the context-menu trigger takes the card's link out of the tab
  order, which shipped as a keyboard regression on three directories.
- **A visible control alone.** One mechanism and no hidden affordance; it would have been the
  simpler decision had it come first, and it gives up the accelerator for no saving once a
  shared block renders both.
- **A control revealed on hover.** Rejected in ADR 0033 and rejected again for the same reason:
  invisible to the keyboard, so it is a worse accelerator than the gesture and no more
  discoverable.
- **Per-surface choice.** What the tree did. It produced three families of card — gesture only,
  button only, and neither — and a reader who has to know which list they are on before they
  know how to act on a record.

## Consequences

**The redundancy condition moves from the record's page to the card itself.** ADR 0033 permitted
a hidden affordance only where the record's page offered the same action; the visible control is
now that guarantee, and it travels with the card. An action offered by the gesture and not by
the control breaks this decision, as does a card whose actions are reachable only by pointer.

**Dropping the gesture would cost a suppression, not nothing.** Nothing in this repository
configures the webview's own context menu, so on every surface that does not claim it, right-click
shows whatever the webview shows and no decision here chose it. That is why *one mechanism* was
never the cheaper option: it is one mechanism plus a suppression, and a gesture the application
ignores is a hole rather than a simplification.

**A card's markup is the block's, not the surface's.** The container is the context-menu
trigger, the record's link is stretched behind the content as the card's single tab stop, and
the control sits at the inline end. A surface that hand-rolls a card and wires a mechanism onto
it is how the three families came about, and is what this removes.

**ADR 0025 is restored as written.** Its rule — a row opens its record, and a row-level action
is an explicit control on the row — was the thing ADR 0033 read as impossible. It is not, and
nothing about ADR 0025 changes.
