---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/block/record-card.svelte
  - apps/desktop/src/lib/design/block/list.svelte
use-when: "a record card or list row is given an action"
---

# Rule — record card actions

## A record card offers its actions from a visible control and from the context gesture

One block owns the card's markup, so a surface inherits both routes instead of choosing.
**The two routes are not equals, and the asymmetry is the rule:** the visible tertiary control
is what the card promises and holds every action, reachable by pointer and by keyboard; the
context gesture is derived from the same list and may hold nothing the control does not.

*Why: a gesture-only card promises nothing, and keyboard users reach no action at all.*

Recorded originally as ADR 0034, *A record card carries its actions twice, and one block owns both routes*.
