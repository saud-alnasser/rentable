---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/block/list.svelte
  - src/lib/dashboard/component/section.svelte
use-when: "a list row is given an action, or a row's click target is in question"
---

# Rule — row activation

## A row opens its record's page, everywhere, and does nothing else

A row-level action is an explicit control on the row, never the row itself. Every record a row
can show therefore has a page to open, payments included.

*Why: a click that means three different things depending on the surface asks the reader to
know which surface they are on before they know what will happen.*

Recorded originally as ADR 0025, *A row opens its record, and does nothing else*.
