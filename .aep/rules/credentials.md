---
aep: 2.6.0
owner: repository
date: 2026-08-19
kind: rule
paths:
  - apps/desktop/tauri/src/sync/**
  - apps/desktop/src/lib/sync/**
use-when: "a credential this application holds is being stored, refreshed, or handed to somebody"
---

<!--
  Merged 2026-08-17 from three single-decision rules, each of which was one
  converted ADR: drive-client-boundary, drive-concurrency,
  drive-transport-testing. **Two of the three are retired below rather than
  deleted** (#554, 2026-08-19): the code they bound is gone, and what each of
  them knew outlives it.
-->

# Credentials, and what Google Drive sync left behind

*This file was `rules/drive.md` until 2026-08-19. It is renamed rather than replaced because one
of its three sections is still a live rule and was never Drive's — a citation of
`[[rules/credentials]], under *Client boundary*` is the same rule under the name it should always have
had.*

> **Google Drive sync is retired.** Decision 07 of [[efforts/a-workspace-follows-its-user/spec]],
> directed by the human on 2026-08-18 and executed by #554: the transport, the file operations,
> the manifest, conflict analysis, retention, the link session, and every surface that offered
> them are deleted. A workspace is of record in Turso and reaches a machine as a replica.
>
> **One section of it is still a rule.** *Client
> boundary* was never Drive's alone — decision 09 widened it to every credential this application
> holds — and `sync/google/` still holds the OAuth half, because signing in is Google rather than
> Drive. The other two sections describe code that no longer exists and are marked as retired
> where they stand.

## Client boundary

**Every network call that spends a credential, and every credential, stays in Rust.**

The OAuth client secret, the refresh token, token refresh, the profile read, the control plane's
session token, and a workspace's sync token all live behind the Tauri boundary. No credential
crosses to TypeScript, and no command hands one over.

*Why: the credential boundary and the network boundary have to be the same boundary — where they
differ, the gap is exactly what an incident occupies.*

**Widened 2026-08-18** ([[efforts/a-workspace-follows-its-user/spec]], decision 09): this is the rule for **every**
credential this application holds, not Drive's alone. A hosted workspace's sync token is a
credential and lives on the same side of the same boundary, for the same reason.

**What crosses is facts *about* a credential, never one.** `RemoteSyncState` carries
`tokenExpiresAt` and the session's three moments; the side that decides whether to keep
replicating needs those numbers and needs nothing else.

Recorded originally as ADR 0003, *The Google Drive client relocates wholly to Rust*.

## Concurrency — **retired 2026-08-19 with the transport it bound (#554)**

It read: *concurrent Drive writes are detected and repaired, never prevented.* Snapshots were the
source of truth, the manifest a derived index, and a mismatch on the read-then-compare before a
manifest write rebuilt the manifest from the snapshots actually present rather than refusing the
write.

**Two things it knew are still true and are why it is kept here rather than deleted.** Drive v3
offers no compare-and-set — no ETag, no precondition, no reserved status code — so anywhere a lock
is reached for against it, the lock inherits the race it was meant to remove. And **what replaced
this concern rather than answering it**: a replica resolves divergence per column as it arrives,
so there is no pair of whole snapshots for anybody to choose between, and nothing to repair.

Recorded originally as ADR 0005, *Drive concurrency is detected and repaired, not prevented*.

## Transport testing — **retired 2026-08-19 with the transport it bound (#554)**

It read: *the Drive transport is tested against a real local HTTP server.* Run one in-process and
point the client at it; never substitute a mocked transport trait, and never contact the live API
from a test.

**The reasoning outlived the transport and is being applied**: a mocked trait tests the mock's
idea of HTTP, so the serialisation and status handling that actually break are never exercised.
The loopback server survives as `sync/google/test/server.rs` and is what the profile read at
sign-in — the one Google request this application still issues — is tested against, along with
every control-plane call.

Recorded originally as ADR 0004, *Drive transport is tested against a local HTTP server*.
