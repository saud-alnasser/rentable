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

> **This surface is being retired.** Decision 07 of [[efforts/a-workspace-follows-its-user/spec]], directed by the
> human on 2026-08-18: **Google Drive sync is dropped in favour of Turso sync.** The rule below
> still binds every change to the code while the code exists — a surface on its way out is not a
> surface it is safe to break — but **nothing here is to be extended**, and a request to add to
> the manifest, the conflict analysis, the retention or the link session is a request to build
> something that is scheduled for deletion.
>
> **What is not going with it:** *Client boundary*, which decision 09 widened from Drive's
> credentials to **every** credential this application holds — a workspace sync token is one, and
> that section outlives this file. And the OAuth half — `google/auth.rs`, the token refresh, the
> account model — which is load-bearing for sign-in and is being lifted out of the link flow
> first, because deleting the link session before that extraction would take identity with it.
>
> *Scoped rather than retired earlier the same day, on a recommendation the human reversed. The
> reasoning both ways is in the decision.*

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

**Retiring 2026-08-18**, with the transport it describes — decision 07, reversed by the human.
The fact stays true of Drive and stops being a fact about this application: Drive v3 offers no
compare-and-set, so anywhere a lock is reached for against it, the lock inherits the race. **What
replaces this concern rather than answering it**: a replica resolves divergence per column as it
arrives, so there is no pair of whole snapshots for anybody to choose between.

Scoped to `manifest.rs` and `conflict.rs`.

Recorded originally as ADR 0005, *Drive concurrency is detected and repaired, not prevented*.

## Transport testing

**The Drive transport is tested against a real local HTTP server.**

Run an HTTP server in-process and point the client at it. Do not substitute a mocked transport
trait, and never contact the live Google Drive API from a test.

*Why: a mocked trait tests the mock's idea of HTTP, so the serialisation and status handling
that actually break in production are never exercised.*

**Retiring 2026-08-18**, with the transport it describes — decision 07, reversed by the human.
The reasoning is worth carrying forward even though the code is not: a mocked transport trait
tests the mock's idea of HTTP, so whatever tests the replacement transport tests it against
something that can actually reject a request.

Scoped to `google/test/**` and `google/transport.rs`. What a change must be tested at more
generally is [[rules/testing]]'s.

Recorded originally as ADR 0004, *Drive transport is tested against a local HTTP server*.
