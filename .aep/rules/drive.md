---
aep: 2.5.1
owner: repository
date: 2026-08-18
kind: rule
paths:
  - apps/desktop/tauri/src/sync/google/**
  - apps/desktop/src/lib/sync/**
use-when: "the request touches Drive credentials, Drive network calls, a manifest or snapshot conflict, or a Drive transport test"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when the Drive sync code is read and costs
  nothing otherwise.

  Merged 2026-08-17 from three single-decision rules, each of which was one
  converted ADR: drive-client-boundary, drive-concurrency,
  drive-transport-testing. Nothing was dropped or reworded — each is a section
  below, under its former file's name, so a citation reads `[[rules/drive]],
  under *Concurrency*`.
-->

# Google Drive sync

**Scoped to local workspaces 2026-08-18** — decision 07 of [[efforts/a-workspace-follows-its-user/spec]]. Drive
**stays**, and it is what a local workspace gets: the automatic, continuous, versioned, retained
route off one machine. A **hosted** workspace is not offered Drive at all — its record of truth is
somewhere Drive knows nothing about, and two sync mechanisms on one workspace is the shape
*Concurrency* below was never designed to survive. That is also why a conversion unlinks Drive
rather than leaving both running.

**What this route loses, written here so it is not discovered later.** Drive resolves divergence
by choosing a side, per whole snapshot: **the losing side loses every change made since the
snapshot that won.** That is far coarser than the per-column loss a hosted workspace has, and it
is the honest price of the mode that has no server.

## Client boundary

**Every Drive network call and every Drive credential stays in Rust.**

The OAuth client secret, the refresh token, token refresh, HTTP, manifest handling, conflict
analysis, and retention all live in `tauri/src/sync/google/`. No Drive network code exists in
TypeScript, and no command hands a credential to the web layer.

*Why: the credential boundary and the network boundary have to be the same boundary — where
they differ, the gap is exactly what an incident occupies.*

**Widened 2026-08-18** ([[efforts/a-workspace-follows-its-user/spec]], decision 09): this is the rule for **every**
credential this application holds, not Drive's alone. A hosted workspace's sync token is a
credential and lives on the same side of the same boundary, for the same reason. Separating
sign-in from linking does not move the boundary — it moves what is on this side of it.

Recorded originally as ADR 0003, *The Google Drive client relocates wholly to Rust*.

## Concurrency

**Concurrent Drive writes are detected and repaired, never prevented.**

Snapshots are the source of truth and the manifest is a derived index. Keep the
read-then-compare before a manifest write as cheap detection: on mismatch, rebuild the manifest
from the snapshots actually present rather than refusing the write. Do not add a remote lease.

*Why: Drive v3 offers no compare-and-set — no ETag, no precondition, no reserved status code —
so a lock can only inherit the same race at the moment it is acquired.*

**Scoped 2026-08-18 to local-workspace Drive sync**, per decision 07. A hosted workspace does not
reach this code, and its divergence is resolved by the replica per column rather than here per
snapshot.

Scoped to `manifest.rs` and `conflict.rs`.

Recorded originally as ADR 0005, *Drive concurrency is detected and repaired, not prevented*.

## Transport testing

**The Drive transport is tested against a real local HTTP server.**

Run an HTTP server in-process and point the client at it. Do not substitute a mocked transport
trait, and never contact the live Google Drive API from a test.

*Why: a mocked trait tests the mock's idea of HTTP, so the serialisation and status handling
that actually break in production are never exercised.*

**Scoped 2026-08-18 to local-workspace Drive sync**, per decision 07. It says nothing about how a
hosted workspace's transport is tested.

Scoped to `google/test/**` and `google/transport.rs`. What a change must be tested at more
generally is [[rules/testing]]'s.

Recorded originally as ADR 0004, *Drive transport is tested against a local HTTP server*.
