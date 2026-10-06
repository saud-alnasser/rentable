---
use-when: "building or reviewing ticket 15 of effort 854, or anything that opens a connection to a turso sync replica while a push or pull may be in flight"
---

# A stalled sync holds `connect()`

Measured 2026-10-06 by ticket 15's implementer, as the plan's measure-first step required
([[efforts/854-bugs-and-edge-cases-across-the-app/plan]], *15. Replica network calls are bounded*,
*The open measurement*).

## What was run

A replica built with `Database::open_replica` (turso 0.8.1) pointed at a remote that completes the
TCP handshake and never answers (a `std::net::TcpListener` bound and never accepted). A table and a
row were written locally, `pull()` was started in a spawned task, and after 500 ms the pull was
confirmed still waiting. Then two probes:

| Probe | Result |
| --- | --- |
| `database.connect()` then a query, under a 5 s `tokio::time::timeout` | never returned; the timeout itself never fired (the test sat 25 minutes before it was killed; later runs were cut by an outer 60 s and 90 s `timeout`, exit 124) |
| a query and an insert on a connection opened **before** the pull stalled | `Ok(Integer(1))` in 49.9 ms |

## Why

`turso_sync_sdk_kit-0.8.1/src/rsapi.rs`: `connect()` (line 418), `push_changes()` (477) and
`wait_changes()` (493) each take `sync_engine.lock_arc()`, a synchronous `parking_lot::Mutex`
held for the whole operation, network wait included. A stalled pull holds it, and `connect()`
blocks its OS thread inside `op.resume()`. Because it blocks the thread rather than yielding, a
`tokio::time::timeout` around it cannot fire, and a tokio worker is lost for as long as the stall
lasts.

## What it means here

Every query on the workspace arm opens a fresh connection (`database/mod.rs` `watched`, used by
`execute_single_sql` and `execute_batch_sql`, and `is_replica_ready`). So a local query stalls
behind a stalled sync whatever application lock is held, and bounding the sync alone lets queries
through only after the bound runs out. Criterion 15 ("another query runs while it waits") cannot be
met by the plan's first approach. A connection that already exists is not held, which is the
plan's named fallback.

The probe, a drafted `database/bound.rs` and a `SilentServer` helper are kept as a patch in the
run's scratchpad, not in the repository.
