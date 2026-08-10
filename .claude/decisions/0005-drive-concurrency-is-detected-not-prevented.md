---
owner: repository
status: accepted
load-when: two clients could write one workspace, or a manifest or snapshot conflict is being handled
sources: [tauri/src/sync/google/manifest.rs, tauri/src/sync/google/conflict.rs]
supersedes: []
superseded-by: []
---

# Drive concurrency is detected and repaired, not prevented

Two clients writing one workspace cannot be prevented with what Google Drive offers: the
v3 API has no compare-and-set — no ETag, no sendable precondition on any method, and no
status code reserved for one — and the sync lock this application holds is in-process
only, so it serialises operations inside one running app and coordinates nothing between
machines. Rather than add a remote lease that would inherit the same race when it is
itself acquired, we treat snapshots as the source of truth and the manifest as a derived
index: a concurrent write can lose the index but never a snapshot, and the index is
rebuilt from the snapshots actually present. The read-then-compare before a manifest write
stays, demoted from a guard to cheap detection — on mismatch the manifest is rebuilt
rather than the write refused.

## Considered Options

**A remote lease** — a lock file in the workspace folder carrying an owner and an expiry.
Rejected because acquiring it needs create-if-absent, which Drive does not offer either, so
it narrows the window rather than closing it while adding stale-lease expiry, crash
recovery, and clock skew to a subsystem that has none of those today.

**Porting the existing check unchanged** and recording the open window as a known
limitation. Rejected because it ships the subsystem's central failure mode forward while
making it look intentional, and the evidence says no later ticket could close it.

## Consequences

Manifest rebuilding becomes load-bearing rather than an emergency path, so it carries the
correctness burden the precondition was believed to carry, and it must be tested as a
primary path. A rebuild costs a folder listing plus a metadata read per snapshot, which is
the price of the reframe. A lost manifest write is now an expected, recoverable event
rather than a fault — which means it must not be reported to the user as an error.

Evidence: `.claude/evidence/research/google-drive-conditional-update.md`, verified against
Google Drive API v3 on 2026-08-02. Two limitations are recorded there and neither is
closed: Google never states the absence of optimistic concurrency, and a Discovery document
describes fields rather than HTTP headers, so an undocumented `If-Match` is not formally
excluded.
