---
owner: repository
status: accepted
load-when: a read needs a contract's paid or expected amount, or a list sorts or filters on one
sources: [src/lib/payment/, src/lib/contract/reconcile.ts]
supersedes: []
superseded-by: []
---

# Payment aggregates are materialized, not derived at read

A contract's `paid_amount` and `expected_amount` were computed on every request by loading
every payment for every contract in the result, which made any search or sort touching them a
full-table scan — and the authoritative status was likewise recomputed at read rather than
read from its stored column, so neither could be expressed in SQL. Both aggregates become
columns maintained by reconcile, exactly as `status` already is, so search, sort and
pagination run against real columns and the values displayed are the values filtered on.

## Considered Options

**Express the derivation in SQL** — rejected. It puts the status and payment-summary rules in
TypeScript and in SQL at once, against this repository's boundary that domain rules live in
their concept's own module, and the two copies would drift. The status model additionally has
characterization tests pinning behaviour that is known to be wrong; the SQL copy would have to
reproduce that bug faithfully and then be corrected in lockstep.

**Query the stored status cache as it stands** — rejected. Cheapest, but filter and display can
disagree: a contract that crossed into `expired` since the last reconcile would filter under its
old status while its row showed the fresh one. It also does nothing for sorting on payment
progress, because those aggregates are stored nowhere.

## Consequences

Reconcile stops being only a cache-freshness concern and becomes load-bearing for what the user
sees — a mutation path that skips it now shows wrong money, not merely a stale badge. The
existing boundary already requires every mutation touching contracts, payments, or unit
assignments to reconcile, so the invariant is not new, but the cost of violating it is higher.

Reconcile's own shape is left open: it currently loads every contract and every payment and
issues per-row updates on each mutation, and whether it becomes incremental is a separate
decision on the interface-overhaul map.
