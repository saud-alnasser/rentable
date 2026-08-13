---
owner: repository
status: superseded
load-when: a record card or list row is given an action
sources: [src/lib/design/block/list.svelte, src/lib/tenant/component/directory.svelte]
supersedes: []
superseded-by: [0034-a-record-card-carries-its-actions-twice.md]
---

# A record card's actions are a context menu, and every one of them is also on the record's page

[ADR 0025](0025-a-row-opens-its-record-and-does-nothing-else.md) settled what a row's click
means and said that a row-level action is an explicit control on the row — a form a directory
card cannot carry, being one line high and already holding a name, its identifiers and six
figures. **A card's actions are reached by the platform's own context gesture instead, and
nothing is reachable only that way**: every entry is also a control on the record's own page,
so the gesture is an accelerator and a reader who never discovers it loses nothing.

## Considered Options

- **A control on the card**, as ADR 0025 describes. Visible and tabbable, and it competes with
  everything already on the card and puts a hit target inside a link.
- **A control revealed on hover.** Costs nothing until hovered, and is invisible to the
  keyboard, which makes it a worse accelerator than the gesture and no more discoverable.
- **Nothing, and the record's page keeps its monopoly.** What was there before. It costs a
  round trip for the two actions a reader most often decides on while looking at the list.

## Consequences

A hidden affordance is now a permitted form of row-level action **on the condition that it is
redundant**. A future action that exists only in a card menu breaks this decision rather than
extending it, and ADR 0025's rule with it.
