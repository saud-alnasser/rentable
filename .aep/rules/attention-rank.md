---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/contract/**
  - apps/desktop/src/lib/dashboard/**
use-when: "a contract's rank, grouping or follow-up order is in question, or a surface outside the dashboard needs one"
---

# Rule — attention rank

## A contract's attention rank is derived in the contract domain

Overdue, behind, and ending soon are decided from a contract's status, end date, and what it
owes today — so the rules live with the contract. The dashboard reads the rank; it never
derives one.

*Why: they were rules about a contract living in a module named for the surface that happened
to read them first, which is why the contracts list could not filter by rank.*

Recorded originally as ADR 0031, *A contract's attention rank is the contract's own*.
