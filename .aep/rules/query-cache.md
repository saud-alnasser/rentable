---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/query.ts
use-when: "a query's caching or invalidation behaviour is in question"
---

# Rule — query cache

## Workspace data is cached with `staleTime: Infinity` and kept truthful by its writers

The three writers are enumerable and each is responsible for announcing itself: a data mutation
invalidates all five data-concept prefixes through the one shared helper; a remote-sync pull
reconciles fully and then invalidates the root; the day-crossing reconcile does the same.
**There are no optimistic updates.**

*Why: TanStack Query's server-era defaults pay a visible round trip for a staleness problem
that cannot exist with no server and no unseen writer — and the refetch behind an invalidate is
a sub-millisecond local query, so there is no latency for an optimistic write to hide.*

Recorded originally as ADR 0012, *The query cache is trusted until told otherwise*.
