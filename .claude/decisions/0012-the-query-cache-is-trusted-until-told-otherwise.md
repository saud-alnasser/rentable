# The query cache is trusted until told otherwise

There is no server and no writer this application cannot see, so TanStack Query's
server-era defaults — data stale immediately, refetch on every remount — pay a visible
round trip for a freshness problem that does not exist here. Workspace data is cached with
`staleTime: Infinity` and the cache is instead kept truthful by its writers, all three of
them enumerable: **a data mutation invalidates all five data-concept prefixes through one
shared helper**; **a remote-sync pull** runs its full reconcile and then invalidates the
root; **the day-crossing reconcile** (ADR 0011) does the same, because it changes visible
rows with no user mutation to announce it. There are **no optimistic updates** — the
refetch behind invalidate-and-refetch is a sub-millisecond local query, so the latency
optimistic writes exist to hide is not there to hide.

## Considered Options

- **A finite staleTime as a safety net** — rejected. It turns a missed invalidation edge
  into an intermittent, self-hiding bug instead of a plainly stale screen, and pays for the
  net with refetches that are almost always no-ops.
- **Invalidation targeted by the join graph** — rejected. After the column vocabulary
  (decision 03) the lists join across concepts, so the edge list would need maintaining as
  columns evolve, and a missed edge behind `staleTime: Infinity` is wrong data on screen
  silently. The refetches breadth costs are sub-millisecond local reads.
- **Optimistic cache patches where cheap** — rejected. Every patched shape is a second copy
  of a row the query already returns, drift surface for no perceptible gain.

## Consequences

- Navigation always renders from cache instantly; a list is refetched only when a writer
  invalidated it.
- The reviewable invariant extends by one clause: a mutation that touches workspace data
  must reconcile **and invalidate through the shared helper**. A mutation path that skips
  either shows wrong data, not slow data.
- `retry: false` and `refetchOnWindowFocus: false` stay: nothing transient to retry
  against, no unseen writer for focus to catch.
- Settings, backups, and remote-sync state are outside this policy and keep their own keys
  and invalidations.
