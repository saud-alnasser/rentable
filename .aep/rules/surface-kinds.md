---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/block/**
use-when: "a new surface for a concept is being placed"
---

# Rule — surface kinds

## A surface's shape follows its kind, never its operation

A surface that **reads** a concept's records takes that concept's own shape; a surface that
**writes** them takes the shared form surface; a surface showing the **application's own state**
takes the shared one too. Create and edit are one surface because they write — not because they
are adjacent verbs.

*Why: dividing by operation multiplies surfaces that answer the same question, and leaves the
reader guessing which of three shapes a given verb will produce.*

Recorded originally as ADR 0020, *Surfaces diverge by kind, not by operation*.
