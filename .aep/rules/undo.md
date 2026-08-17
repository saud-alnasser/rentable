---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/**
  - apps/desktop/src/lib/api/**
use-when: "a data mutation is added, or undo, redo, or recovering a deleted record is in question"
---

# Rule — undo

## Undo and redo are a session stack of inverses replayed through the real procedures

Each data mutation records the call that reverses it, and undoing issues that call through the
same procedure a typed action goes through — so validation, reconciliation, cache invalidation,
and the autosync push all fire exactly as they do for the original.

*Why: a second write path for undo diverges from the first, and the divergence shows up as
data that a normal mutation could never have produced.*

Recorded originally as ADR 0026, *Undo is a session stack of inverses, replayed through the real procedures*.
