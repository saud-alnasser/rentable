---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/contract/reconcile.ts
use-when: "a mutation, a sync pull, or a day crossing has to move derived state"
---

# Rule — reconcile scope

## Reconcile is scoped by trigger, never by rule

A mutation reconciles only its touch-set: the contracts it changed, their payments, their
assignments, the units those assignments name, and those units' other assignments. The
whole-table pass runs for the three triggers that have no touch-set — application start, a
UTC-day crossing, and a remote-sync pull. The derivation functions stay single-homed in
TypeScript and unchanged.

*Why: time moves derived state only at UTC day boundaries and a mutation can only invalidate
what it touched, so a full pass per save costs 40 ms and 2.6 MB to establish nothing.*

Recorded originally as ADR 0011, *Reconcile is scoped by trigger: touched rows on mutation, whole table on time and sync*.
