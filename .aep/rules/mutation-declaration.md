---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/mutation.ts
  - src/lib/design/query.ts
use-when: "a data mutation is added, or where a mutation's cache invalidation, toast, or inverse is written is in question"
---

# Rule — mutation declaration

## A data mutation is declared once, on the caller side

The declaration carries the call, the message, what it touches, and its inverse. The hook, the
cache invalidation, and the undo entry are **derived** from it — never written out per mutation.

*Why: writing each mutation twice produced fifteen near-identical hooks that had already
drifted, with two deletions of the same shape differing on whether they checked a result and
nothing saying why.*

Recorded originally as ADR 0028, *A mutation is declared once, on the caller side*.
