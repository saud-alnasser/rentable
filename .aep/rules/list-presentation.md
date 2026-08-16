---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/block/list.svelte
use-when: "a list's presentation is being chosen or changed"
---

# Rule — list presentation

## The list mechanism is shared and the presentation is per concept

One shell owns the query state, the search and its debounce, virtualization, the empty state,
the result count, and the create action. The module that owns the data supplies a snippet
saying what one record looks like.

*Why: the five lists are not five of a kind — payments are an account statement, units an
occupancy board, contracts a triage queue, tenants and complexes directories searched rather
than browsed — and one uniform table fits none of them.*

Recorded originally as ADR 0013, *Each list gets the presentation its data is shaped like, over one shared shell*.
