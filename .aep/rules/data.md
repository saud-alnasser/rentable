---
aep: 2.2.0
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/**
  - apps/desktop/src/lib/api/**
  - apps/desktop/src/lib/platform/database/**
  - apps/desktop/src/lib/payment/**
  - apps/desktop/src/lib/contract/reconcile.ts
  - apps/desktop/tauri/src/database/**
use-when: "a read, a write, a cached query, derived state, or undo is in question"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a read or write path is touched and costs
  nothing otherwise.

  Merged 2026-08-17 from seven single-decision rules, each of which was one
  converted ADR: list-reads, query-cache, mutation-declaration, undo,
  multi-table-writes, reconcile-scope, payment-aggregates. Nothing was dropped or
  reworded — each is a section below, under its former file's name, so a citation
  reads `[[rules/data]], under *Undo*`.
-->

# Data

What a read returns, what a write does, and what is derived from what. Where the
routers and the IPC boundary sit is [[rules/api-layer]]'s; how a surface presents any
of it is [[rules/interface]]'s.

## Reads

### List reads

**A list issues one query per (search, sort) state and loads the whole result set.**

`WHERE` from the search, `ORDER BY` from a whitelisted per-list sort key, and no
`LIMIT`/`OFFSET`. The virtualizer renders the viewport out of the full set; a search or sort
change re-queries and scrolls to top. **Do not reintroduce pagination on the read path.**

*Why: there is no server — a SQL-filtered full read of the largest list at realistic scale
measures under a millisecond, and user-chosen sort invalidates an accumulated page cache on
every header click.*

Recorded originally as ADR 0010, *Lists load whole result sets, and pagination is retired from the read path*.

### Payment aggregates

**A contract's paid and expected amounts are read from their columns, never computed at read.**

`paid_amount` and `expected_amount` are columns maintained by reconcile, exactly as `status`
is. Search, sort, and filter run against those columns, so the value displayed is the value
filtered on. Do not express the derivation in SQL — the domain rules stay single-homed in
their concept's module.

*Why: computing them per request loads every payment for every contract in the result, making
any search or sort touching them a full-table scan.*

Recorded originally as ADR 0006, *Payment aggregates are materialized, not derived at read*.

### Query cache

**Workspace data is cached with `staleTime: Infinity` and kept truthful by its writers.**

The three writers are enumerable and each is responsible for announcing itself: a data mutation
invalidates all five data-concept prefixes through the one shared helper; a remote-sync pull
reconciles fully and then invalidates the root; the day-crossing reconcile does the same.
**There are no optimistic updates.**

*Why: TanStack Query's server-era defaults pay a visible round trip for a staleness problem
that cannot exist with no server and no unseen writer — and the refetch behind an invalidate is
a sub-millisecond local query, so there is no latency for an optimistic write to hide.*

Recorded originally as ADR 0012, *The query cache is trusted until told otherwise*.

## Writes

### Mutation declaration

**A data mutation is declared once, on the caller side.**

The declaration carries the call, the message, what it touches, and its inverse. The hook, the
cache invalidation, and the undo entry are **derived** from it — never written out per mutation.

*Why: writing each mutation twice produced fifteen near-identical hooks that had already
drifted, with two deletions of the same shape differing on whether they checked a result and
nothing saying why.*

Recorded originally as ADR 0028, *A mutation is declared once, on the caller side*.

### Multi-table writes

**A mutation that writes more than one table issues its writes as a single batch.**

The boundary already runs a batch inside one transaction and commits at the end.

*Why: separate queries leave a half-applied pair with no way back — creating a complex and its
units is one act to the user and must be one act to the database.*

Recorded originally as ADR 0027, *A write that spans tables is one batch, and the batch is the transaction*.

### Undo

**Undo and redo are a session stack of inverses replayed through the real procedures.**

Each data mutation records the call that reverses it, and undoing issues that call through the
same procedure a typed action goes through — so validation, reconciliation, cache invalidation,
and the autosync push all fire exactly as they do for the original.

*Why: a second write path for undo diverges from the first, and the divergence shows up as
data that a normal mutation could never have produced.*

Recorded originally as ADR 0026, *Undo is a session stack of inverses, replayed through the real procedures*.

## Derived state

### Reconcile scope

**Reconcile is scoped by trigger, never by rule.**

A mutation reconciles only its touch-set: the contracts it changed, their payments, their
assignments, the units those assignments name, and those units' other assignments. The
whole-table pass runs for the three triggers that have no touch-set — application start, a
UTC-day crossing, and a remote-sync pull. The derivation functions stay single-homed in
TypeScript and unchanged.

*Why: time moves derived state only at UTC day boundaries and a mutation can only invalidate
what it touched, so a full pass per save costs 40 ms and 2.6 MB to establish nothing.*

Recorded originally as ADR 0011, *Reconcile is scoped by trigger: touched rows on mutation, whole table on time and sync*.
