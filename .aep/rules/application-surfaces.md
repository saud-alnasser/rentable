---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/layout/component/**
  - apps/desktop/src/lib/sync/component/**
  - apps/desktop/src/routes/+error.svelte
use-when: "a surface the application shows about itself — starting, failing, recovering, choosing a workspace — is being built or restyled"
---

# Rule — application surfaces

## The application's own surfaces converge on one shared surface

Starting, failing, recovering, asking which workspace to open, and reporting an unanticipated
error all take the shared surface in the design system.

*Why: these surfaces have no data of their own to take a shape from, so the reasoning that
makes the concept lists diverge does not reach them — what they have in common is the whole of
what they are.*

Recorded originally as ADR 0015, *The application's own surfaces converge, where its concepts' surfaces diverge*.
