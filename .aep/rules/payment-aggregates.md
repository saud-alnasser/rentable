---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/payment/**
  - apps/desktop/src/lib/contract/reconcile.ts
use-when: "a read needs a contract's paid or expected amount, or a list sorts or filters on one"
---

# Rule — payment aggregates

## A contract's paid and expected amounts are read from their columns, never computed at read

`paid_amount` and `expected_amount` are columns maintained by reconcile, exactly as `status`
is. Search, sort, and filter run against those columns, so the value displayed is the value
filtered on. Do not express the derivation in SQL — the domain rules stay single-homed in
their concept's module.

*Why: computing them per request loads every payment for every contract in the result, making
any search or sort touching them a full-table scan.*

Recorded originally as ADR 0006, *Payment aggregates are materialized, not derived at read*.
