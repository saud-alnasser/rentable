---
aep: 2.5.1
owner: repository
date: 2026-08-18
kind: prototype
---

# Hypothesis

**`@tursodatabase/sync` can serve the architecture directed on 2026-08-18** — one Turso
database per workspace, synced to directly by an offline-capable client, with the credential
minted by an API that is never in the data path.

That splits into six claims, one per open question of decision 11. Each is stated so it can
be wrong, and each is answerable only by running code against a live account.

| # | Claim |
| --- | --- |
| 1 | The sync client can target **a database this application creates itself** through the Platform API, rather than only one created by hand in the dashboard. |
| 2b | Two disconnected replicas, each creating a record the other has never seen, **collide on the primary key** — because every key is a bare rowid taking the next above the highest in use. Decision 13 predicts this; the run confirms it. |
| 2a | Under contention on one existing row, the loss from last-push-wins is bounded and **nameable** — per statement, per row, or per field. |
| 3 | A **genuinely offline first launch** either works or fails in a way the application can act on, rather than hanging or corrupting the local file. |
| 5 | The client **accepts a replacement auth token for a replica it already holds**, without re-bootstrapping it. |
| 6 | A whole-table reconcile pass — one `UPDATE` per changed row, sequentially awaited — costs an amount over the wire that the application can afford at every start. |

# Falsifier

Written before the experiment. Each line is what would have to be observed to abandon the
claim beside it.

| # | What refutes it |
| --- | --- |
| 1 | A database created through the Platform API cannot be opened as a sync target — a URL scheme the client rejects, or a connect that errors — while one created another way can. |
| 2b | Both records survive with distinct identities. That refutes the collision, and decision 13's migration would then be paid for nothing. |
| 2a | The loss is unbounded or silent — a whole database version replaced with no way to name what was in the discarded one. |
| 3 | A first launch with no network hangs, or leaves a local file that a later connected launch will not open. |
| 5 | Rotating the token forces a re-bootstrap: the replica re-downloads, or the client errors until it is recreated from scratch. **This is the one whose failure costs the most** — short-lived tokens are how requirement 15's three-day window is enforced by a lifetime instead of a client-side flag, and how removing a member takes effect. |
| 6 | The pass is dominated by per-statement round-trip latency rather than by payload, making the cost a function of row count in a way that a real workspace makes unaffordable. |

**The gate's own falsifier, above all of these:** requirement 7 is that the application
remains fully usable with no network, reads **and** writes, in both modes. A run that finds no
way for this client to accept an offline write and later push it ends the hosted half of the
effort rather than downgrading it. Local mode is unaffected either way.

**What does not refute the gate:** 2b coming back confirmed. When 2b was written it was a
discovery; decision 13 has since chosen client-generated UUIDv7 as the answer, so a confirmed
collision now supplies acceptance criterion 17's *pre-migration behaviour captured as a
failing test first* rather than reopening anything.

# Experiment

Run 2026-08-18 against a live Turso account, in a detached worktree at
`.aep/worktrees/gate-11`, with a self-contained node project under
`apps/desktop/src/lib/prototype/gate-11/` that installs the sync client on its own rather
than through the monorepo lockfile.

**Versions, because the answers are only about these.** `@tursodatabase/sync` **0.7.2**, with
`sync-common` and `database-common` at the same version and the native binding
`sync-win32-x64-msvc`. Node **v24.18.0**, Windows 11.

**Credentials.** A Platform API token scoped to the group `rentable`, and the org slug, read
from `apps/desktop/.env` — which is where they belong and where they stayed. The Platform API
is reachable at `https://api.turso.tech/v1/organizations/<org>`; the run created its own
database and minted its own database auth tokens from that one credential, which is the
credential path decision 05 depends on.

**Scripts, one per question**, each run on its own so the observation is not entangled with
the next: `q1-create.mjs`, `q1-connect.mjs`, `q2b.mjs`, `q2a.mjs`, `q2a2.mjs`, `q3.mjs`,
`q5.mjs`, `q5b.mjs`, `q6.mjs`. Two replicas are two local file prefixes with two
`clientName`s; a replica is "offline" by not being asked to `pull()` or `push()`, which is
what an unreachable network amounts to for this engine.

# Observation

## 1 — the client targets a database this application creates *(confirmed)*

`POST /v1/organizations/<org>/databases` with `{name: 'gate-11', group: 'rentable'}` returned
`200` and a hostname. The database reports `database_type: "libsql"` and
`server_type: "turso-server"`.

Opening it with `connect({ path, url: 'libsql://gate-11-<org>.aws-eu-west-1.turso.io',
authToken })` succeeded in **1007 ms**, created a table, and pushed:

```
connect() returned in 1007 ms
created table and pushed
stats {"cdcOperations":1,"networkSentBytes":1724,"networkReceivedBytes":5352, ...}
```

**The `turso://` worry in decision 11 does not apply to this version.** A `libsql://` URL is
what the Platform API hands you and it is what the sync client takes.

## 2b — the uncontended collision *(confirmed, and it is silent)*

Both replicas started synced and empty. Each then recorded one payment the other had never
seen, and both pushed.

```
start: A sees 0  B sees 0
offline A local: [{"id":1,"note":"riyadh"}]
offline B local: [{"id":1,"note":"jeddah"}]
A pushed
B pushed
after sync A: [{"id":1,"note":"jeddah"}]
after sync B: [{"id":1,"note":"jeddah"}]
```

**Two payments were recorded and one exists.** Riyadh's is gone. Neither push errored,
neither replica reports a conflict, and both converge on the same wrong answer — so nothing in
the application could detect it, let alone tell the user. This is acceptance criterion 9's
*silent, unreportable loss*, reproduced in the ordinary case: no contention, no shared record,
no unusual behaviour, just two people using the product.

## 2b′ — and the remedy works *(the same experiment with text keys)*

The same two replicas, same offline pattern, against a table whose key is a client-assigned
`TEXT`:

```
TEXT KEYS both survive? -> [{"id":"0199-aaa","note":"riyadh"},{"id":"0199-bbb","note":"jeddah"}]
```

**Both survive, both distinct.** Decision 13's scheme is confirmed against the live engine,
not only against reasoning.

## 2a — the contended case is better than feared *(loss is per column)*

This is the result that surprised me. Two replicas, one existing row, each changing a
**different column** offline:

```
offline A: [{"id":1,"rent":2000,"status":"active","tenant":"ali"}]
offline B: [{"id":1,"rent":1000,"status":"terminated","tenant":"ali"}]
after   A: [{"id":1,"rent":2000,"status":"terminated","tenant":"ali"}]
```

**Both edits survived.** The engine ships only the changed columns — `DatabaseRowMutation`
carries an `updates` map of *only updated columns* — so "last push wins" operates per column
rather than per row.

Where the two change the **same** column, the later push wins that column and only that
column:

```
SAME COLUMN  A pushed 3000 then B pushed 4000 -> [{"id":1,"rent":4000,"status":"active"}]
```

And a delete beats a concurrent update, with no error on either side:

```
DELETE/UPDATE A (delete) pushed
  B (update) pushed
DELETE/UPDATE result -> []
```

So the loss is **bounded and nameable**: per column for updates, and total for a row deleted
under a concurrent edit.

## 3 — an offline first launch works only if sync is deferred

Two shapes, and only one of them is usable.

**A URL passed up front to an unreachable remote fails at `connect()`:**

```
connect() threw: Error | sync engine operation failed: database sync engine error: fetch error: TypeError: fetch failed
```

No local database, nothing to fall back to. It is an error rather than a hang or a corrupted
file, so it is actionable — but a fresh install that opened this way on a disconnected machine
would be dead.

**`url` given as a function that returns `null` until online is the working path.** The
option's own documentation calls this deferred sync, and it behaves as advertised:

```
offline first launch: connect ok
offline write ok: [{"id":1,"note":"written with no network"}]
push while offline threw: Error | ... url is empty - sync is paused
after network arrives: [{"id":1,"note":"written with no network"}]
```

The offline-written row survived the network arriving and pushed. The refusal to push while
offline names its own reason in a string an application can match on.

**Drift found: `bootstrapIfEmpty` does not exist in 0.7.2.** Decision 11's question 3 was
written against an option this package no longer has. The question it was asking is still real
and is answered above; the mechanism named in it is not.

## 5 — rotation is free *(confirmed, decisively)*

The claim needed a control, because the first measurement was misleading. Seeding 2000 rows
cost 346,912 bytes received; the *first* reopen after that bulk write cost 451,391, which
looked like a re-bootstrap until it was isolated. Reopening the same replica five times in a
row, alternating a freshly minted token with the original:

```
same #1     recv    8269 sent     56 rows 2002
same #2     recv      63 sent     56 rows 2002
rotated #1  recv      63 sent     56 rows 2002
rotated #2  recv      63 sent     56 rows 2002
same #3     recv      63 sent     56 rows 2002
```

**A rotated token costs exactly what an unrotated one costs: 63 bytes.** The expensive reopen
was reconciliation after a bulk local write, not rotation. Rotation is not a re-bootstrap and
is not distinguishable from no rotation at all.

`authToken` also accepts `() => Promise<string>` — its own documentation calls it "short-lived
credentials for every new request" — and it worked, called three times across one
connect/pull/push cycle:

```
callback form      : token fn called 3 times; recv 9667 rows 2002
```

## 6 — the reconcile pass is not on the wire *(confirmed)*

1000 contracts, then the pass the application runs today: one `UPDATE` per changed row,
sequentially awaited.

```
1000 sequential UPDATEs, local  : 1457 ms; bytes sent during them: 0 ; cdcOperations pending 2001
one push of those 1000 changes  : 307 ms; 329280 bytes sent
whole-table read of 1000 rows: 2 ms; a pull that finds nothing: 260 ms
```

**Zero bytes during the pass.** Writes land in the local replica and the network sees one
batched push afterwards, so the falsifier — a cost dominated by per-statement round trips —
does not describe this engine. There are no per-statement round trips.

The number worth carrying forward is the other one: **1457 ms for 1000 local updates**, about
1.5 ms per row, which is slower than the same statements against plain SQLite and is the
figure that decides affordability at a real workspace's size. A pull that finds nothing costs
one round trip, 260 ms.

# Result

**Confirmed, against every falsifier stated above, with one question answered conditionally.**

| # | Verdict |
| --- | --- |
| 1 | Confirmed — a Platform-API-created `libsql://` database is a valid sync target |
| 2b | Confirmed — the collision is real, total, and silent |
| 2a | Confirmed, and better than assumed — loss is per column, not per row |
| 3 | **Conditional** — offline first launch works only where the application defers sync by passing `url` as a function |
| 5 | Confirmed — rotation costs 63 bytes, identical to no rotation |
| 6 | Confirmed — the pass costs nothing over the wire; one batched push follows it |

**The gate's own question — requirement 7, offline reads and writes in both modes — is met.**
A replica accepts writes with no network and pushes them when the network returns, and the
offline-written row survives. Nothing here ends the hosted half of the effort.

# Conclusion

**Go on the client.** Decision 10's choice of `@tursodatabase/sync` survives contact with a
live database, and decision 11 can close as a go rather than a no-go. Four things follow, and
three of them are new constraints on how the desktop client is written rather than on whether
it can be.

- **Decision 13 is not optional and is not deferrable.** 2b is not an edge case; it is what
  two ordinary users produce. Shipping the hosted half against rowid keys would lose payments
  with no error and no trace. 2b′ confirms the chosen remedy works on this engine.
- **The client must pass `url` as a function, not a string.** That is the difference between a
  fresh install that opens on a train and one that cannot open at all. It is a small
  requirement with no cost, and it is invisible until the day it matters.
- **Short-lived tokens are affordable, so requirement 15 can be enforced by a lifetime.** The
  credential model the architecture rests on is confirmed: rotation is free, and the client
  takes a callback that mints per request. Removing a member by declining to renew works.
- **Conflict loss is per column, which changes what *Undo* in [[rules/data]] has to survive.**
  The reasoning there assumed a single writer; the loss it now has to account for is a column
  overwritten by a later push, not a row replaced wholesale. That is a smaller thing to
  explain to a user, and it is decision 09's to re-scope.

**Two things this run did not settle**, named so they are not read as settled:

- Whether 1.5 ms per local row is affordable at a real workspace's size. The reconcile pass is
  off the wire, which was the question asked; whether it is fast enough is a different one,
  and it needs a real workspace's row counts rather than a synthetic thousand.
- What the application does when a push *does* fail — the run never saw `PushStatus::Conflict`,
  which §7 of [[efforts/a-workspace-follows-its-user/evidence/research/libsql-embedded-replica-guarantees]]
  found has no library-provided recovery path. That finding stands and was not exercised here.

# Disposition of the code

**Deleted.** The worktree at `.aep/worktrees/gate-11` and everything under it is gone.

**The `gate-11` database could not be deleted, and it is still there.** `DELETE` returned
`403 group rentable is delete-protected and cannot be deleted` — the *group* carries
`delete_protection: true`, which blocks removing databases inside it even though the database
itself sets that flag false. Every table the run created was dropped instead, so it holds
nothing but the engine's own `turso_cdc` bookkeeping. Removing it means clearing the group's
delete protection first, which is an account setting and the user's to change. The Platform API
token used is likewise theirs to revoke.

**One idea is worth promoting, and it is not code:** `url` as a function rather than a string,
so a disconnected first launch opens. What ships is written under `[[modes/implement]]`, with
the handling a prototype deliberately skipped — and the promotion is recorded in `spec.md`,
not here.
