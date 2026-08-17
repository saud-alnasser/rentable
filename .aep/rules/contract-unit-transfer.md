---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/contract/component/**
use-when: "a contract's units are being assigned, or a writing control is being put on a reading surface"
---

# Rule — contract unit transfer

## A contract's units are transferred on the tab that lists them

The tab holds both panes and performs the transfer itself. There is no assignment dialog and no
create control standing in for one.

*Why: a `+` promises to add a unit, and what it opened chose the contract's whole set in both
directions — the only way into the surface described a different operation than the surface
performed.*

Recorded originally as ADR 0029, *A contract's units are transferred on the tab that shows them*.
