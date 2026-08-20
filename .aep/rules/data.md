---
aep: 2.7.0
owner: repository
date: 2026-08-20
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

*Why: the read is local — a SQL-filtered full read of the largest list at realistic scale
measures under a millisecond, and user-chosen sort invalidates an accumulated page cache on every
header click.*

**Restated 2026-08-18, re-read 2026-08-20 (#573), and the remote of record strengthens this
rather than threatening it** ([[efforts/a-workspace-follows-its-user/spec]], decision 09). The
*why* used to open "there is no server", **and that is no longer true of this application** —
there is one, it holds the record, and every workspace is a database in it. What replaces the old
ground is better than what it loses: a read is served by the **local replica** rather than by the
remote, so it is still local at local latency, and the remote bills rows **scanned** rather than
rows returned, so the declared filters that narrow the read in SQL are exactly what stops a
whole-result-set read being billed as a full-table scan. What would genuinely break this rule is
a read that crossed the wire per keystroke, and nothing here does.

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

The writers are enumerable and each is responsible for announcing itself: a data mutation
invalidates all five data-concept prefixes through the one shared helper; a remote-sync pull
reconciles fully and then invalidates the root; the day-crossing reconcile does the same; and the
replica's own pull is a fourth writer of exactly that kind, which announces itself the same way.
**Nothing pulls yet** — the replica is built but not on the read path — so the enumeration is
three today and four the moment it is. **There are no optimistic updates.**

*Why: TanStack Query's server-era defaults pay a visible round trip for a staleness problem this
application answers by enumeration instead — and the refetch behind an invalidate is a
sub-millisecond local query, so there is no latency for an optimistic write to hide.*

**Scoped 2026-08-18, the scoping withdrawn 2026-08-20 (#573), and this is the row that had to be
got right** ([[efforts/a-workspace-follows-its-user/spec]], decision 09). The rule used to be
argued from *three* writers and no unseen one, and a replicated workspace has an unseen writer by
construction — another device. **What the rule rests on is that the enumeration is complete, not
that it is short**, so the replica's pull extends the list rather than relaxing the cache.
`staleTime: Infinity` with an unannounced writer is a bug; with an announced one it is the same
rule it always was. And what it costs if this is got wrong is a **stale surface, never a wrong
write** — the window is between another device's push and this device's next pull, and closing it
is the pull's job.

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

**Scoped 2026-08-18, the scoping withdrawn 2026-08-20 (#573), and it costs one behaviour**
([[efforts/a-workspace-follows-its-user/spec]], decision 09). Undo is a *session* stack, so it
never depended on the workspace being one syncable unit — it depended on the inverse still making
sense when it runs. Divergence merges **per column**: an inverse issued after another device
changed a different column does the right thing, and one issued after another device changed the
*same* column overwrites their value, which is what any ordinary edit would have done and is not
undo's problem. **The exception is measured and is the one to hold**: a row deleted on another
device takes a concurrent edit with it, whole and with no error on either side. So **an inverse
naming a row that no longer exists fails visibly rather than silently writing nothing, and it does
not recreate the row** — recreating it would resurrect a record somebody deleted. Undoing a
*deletion* still restores the record as itself, by its own identity, unchanged.

*What went on 2026-08-20: "**Local mode is unaffected**: nothing can delete a row out from
under a local session." There is one kind of session now, so the exception above is the only
case there is, and an escape hatch that no longer exists is worse than none — it reads as
though half the application were still safe from this.*

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

**Confirmed unchanged 2026-08-18, and still unchanged 2026-08-20**
([[efforts/a-workspace-follows-its-user/spec]], decision 09). The rule is written against the
*trigger* rather than the mechanism, so the replica's pull is the same trigger and needs no new
words. What **is** superseded is the pricing once put on it — one round trip per changed row,
which was a price for reading over the wire. Reconcile reads the local replica, so a whole-table
pass costs what it costs today: nothing over the wire, followed by one batched push.

Recorded originally as ADR 0011, *Reconcile is scoped by trigger: touched rows on mutation, whole table on time and sync*.
