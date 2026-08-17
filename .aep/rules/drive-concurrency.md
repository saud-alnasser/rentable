---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/tauri/src/sync/google/manifest.rs
  - apps/desktop/tauri/src/sync/google/conflict.rs
use-when: "two clients could write one workspace, or a manifest or snapshot conflict is being handled"
---

# Rule — drive concurrency

## Concurrent Drive writes are detected and repaired, never prevented

Snapshots are the source of truth and the manifest is a derived index. Keep the
read-then-compare before a manifest write as cheap detection: on mismatch, rebuild the manifest
from the snapshots actually present rather than refusing the write. Do not add a remote lease.

*Why: Drive v3 offers no compare-and-set — no ETag, no precondition, no reserved status code —
so a lock can only inherit the same race at the moment it is acquired.*

Recorded originally as ADR 0005, *Drive concurrency is detected and repaired, not prevented*.
