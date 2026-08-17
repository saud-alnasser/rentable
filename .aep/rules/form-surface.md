---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/block/form-surface.svelte
use-when: "a form is being presented, or a form surface has to survive a breakpoint crossing"
---

# Rule — form surface

## A form presents two ways from one component, in CSS

Never render a dialog below the breakpoint and a sheet above it. Which presentation appears is
decided by a **weight the form declares** — light or heavy — with the window deciding only
whether that presentation fills the width it has.

*Why: swapping components across the breakpoint destroys and recreates the subtree, taking the
user's typed values, validation errors, scroll position, and focus with it — and a sheet here
is already a dialog, so there was never a second component to swap to.*

Recorded originally as ADR 0017, *A form surface is one component that presents two ways, not two components swapped*.
