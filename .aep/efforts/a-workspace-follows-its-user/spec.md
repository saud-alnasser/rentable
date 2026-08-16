---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: draft
---

# decisions: a workspace follows its user

**The map is [#497](https://github.com/saud-alnasser/rentable/issues/497)**, and it holds the
destination, the standing requirements, the decisions settled so far, and what is still fog.
This file holds the other half: the decision sections themselves, which on a branch-bound tracker
produce no branch and so are not tickets. The map gists and links; nothing here is mirrored back
onto it.

Working a section: resolve it, write the answer here, and append one line to the map's
**Decisions so far**. One per session, except research, which runs alongside.

## 01 — research(persistence): what a libSQL embedded replica actually guarantees

Status: **resolved** — the finding at [[efforts/a-workspace-follows-its-user/evidence/research/libsql-embedded-replica-guarantees]],
verified 2026-08-13 against `@libsql/client` 0.17.4 and Turso Cloud's published documentation.
Part of: map
Type: research
Blocked by: —

**The load-bearing answer is no.** A `@libsql/client` embedded replica in its default
configuration does not accept writes while disconnected: writes are sent to the primary and are
not written to the local file first, so a disconnected default replica is **read-only**. Reads
are local and stay local. The shape recorded under *Decisions so far* — remote of record, local
replica — therefore **does not preserve offline-first on its default configuration**, and the
Constraint is either kept by taking one of the two non-default paths below or explicitly traded.

Two paths keep offline writes, and neither is free:

- **`@tursodatabase/sync`** — Turso's own recommendation for offline writes, fully local-first
  with explicit `push()`/`pull()` and **last-push-wins** conflict resolution, where a losing
  writer's values are overwritten with no signal, per statement rather than per row-version. It
  runs on the Turso engine rather than libSQL: pre-1.0, and **early preview on Turso Cloud**.
  A first launch needs the remote reachable unless `bootstrapIfEmpty` is set false.
- **`@libsql/client` with `offline: true`** — the legacy flag Turso now steers away from. Its
  conflict path **errors** with no published recovery story, and in the pinned version the
  builder silently drops `syncInterval` in the offline branch, so periodic sync does not run and
  nothing reports it. Both of those are code-derived from a newer revision than the pinned one.

What the finding settles for the rest of the map:

- **Transactions survive (02, ADR 0027).** A batch stays atomic on every transport examined —
  synthesised client-side as `BEGIN`/conditional statements/conditional `COMMIT`/`ROLLBACK` in
  one pipelined request. But the mode argument becomes load-bearing where it is inert today, and
  in **opposite directions** on the two stacks: `@libsql/client`'s `batch()` defaults to
  `deferred`, which can fail on its read-to-write mode change against a replica; the new stack's
  `batch()` without a mode is **not transactional at all**. Interactive transactions exist and
  lock for writing with a 5-second timeout.
- **Credentials are finer than expected, and revocation is coarser (05).** Tokens scope by
  group, database, read-only, expiry, and **table plus action**. There is no row-level scoping
  documented anywhere. Revocation is **bulk-only** — invalidating one database's tokens rotates
  keys and kills every token in its group — with no published propagation time, and the free
  tier permits only one group. The Platform API endpoint an application would call to mint a
  per-user token exposes only `full-access | read-only`, not the fine-grained flags the CLI
  documents; the two pages disagree and the finding did not settle which is stale.
- **Migrations have a documented path and an undocumented hazard (06).** drizzle-kit with
  `dialect: "turso"` pointed at the remote is the documented route, and it is the same
  `drizzle-kit generate` this repository already runs — only `migrate` moves. `PRAGMA
  user_version` is read-only on Turso Cloud, so a `_schema_version` table replaces it. The one
  feature built for propagating a schema across many databases — exactly the per-workspace shape
  — is **deprecated for new users**. On client/schema version skew Turso publishes one sentence,
  scoped to that deprecated feature, and pushes it to the application. Decision 06 gets no help.
- **Per-workspace databases are affordable and metered in a surprising unit (05, 09).** Free
  gives 100 databases; paid tiers are unlimited. There is no documented per-database size cap and
  **no documented concurrent-connection limit at all**. Exceeding any single quota metric blocks
  the databases outright unless overages are enabled. "Rows read" bills **scans, not results** —
  which prices ADR 0010's unbounded reads directly — and sync bills 4 kB frames even for a
  one-byte row.
- **Read latency is a non-issue on a replica and write latency is the real cost (09).** Replica
  reads are local, documented as microseconds, and not network-bound. Commits carry a documented
  **ceiling of added latency by plan** — 100/50/25/10 ms — on top of the round trip, per commit.
  That prices reconcile's one-`UPDATE`-per-changed-row loops brutally against a remote, and it is
  the number the Drift section below is about. Turso publishes no response-size cap; the
  open-source server defaults are 10 MB per response and 32 MB total.

**What stayed open**, carried forward rather than closed by inference: what `offline: true`
actually guarantees, since Turso publishes nothing on it; whether `@tursodatabase/sync` can
target a libSQL rather than a tursodb database, which decides whether choosing offline writes
also means choosing the preview engine; how fast revocation propagates and what an already
connected or offline replica does when its token is invalidated; and client/schema version skew.

## 10 — grilling(persistence): which client, and whether offline-first survives

Status: **decided — option A, contingent on decision 11**
Part of: map
Type: grilling
Blocked by: 01 (resolved)

**Chosen: `@tursodatabase/sync`.** It is the only path that keeps the offline-first Constraint
whole without this repository writing its own convergence, and it is where the vendor is taking
the requirement. The choice is **contingent** rather than settled: decision 11 confirms it can
target a database this application can actually create, and confirms the fallback is real before
the fallback is needed. If 11 comes back against it, option B is the fallback and option C is the
trade of last resort — and C is a trade, not a default anybody may take quietly.

**Question.** Given that a default embedded replica is read-only when disconnected, which of
these does this application become? Offline-first is a stated repository Constraint, so option C
is a trade requiring the user's agreement and a rewritten Constraint — it is listed because
refusing to list it would be deciding it.

**A — `@tursodatabase/sync`, local-first with explicit push and pull.**
*Advantages:* the vendor's own recommendation for this requirement; reads and writes both local,
so the offline Constraint is kept whole and the transport seam gets a client that behaves like
today's local one; multi-device convergence is the product's job rather than this repository's.
*Disadvantages:* it is a different engine from libSQL, so nothing about it inherits SQLite's
track record; last-push-wins overwrites a losing writer's values silently, per statement rather
than per row-version, which is a worse story than today's whole-side conflict resolution and
lands squarely on ADR 0026's reasoning.
*Risks:* pre-1.0 engine, **early preview on Turso Cloud** — the foundation of the whole
application on a preview offering; and it is unverified whether it can target a libSQL database
at all, which would force the engine choice as well as the client choice.
*Maintenance impact:* highest exposure to vendor churn of the four; a breaking change in a
pre-1.0 engine is a change to the layer everything else stands on.

**B — `@libsql/client` embedded replica with `offline: true`.**
*Advantages:* the mature libSQL engine and the production-supported replica machinery; offline
writes without leaving the stack Turso says is production-ready.
*Disadvantages:* Turso explicitly steers away from the flag and calls the other path its modern
equivalent, so this is choosing the deprecated half of a live product.
*Risks:* the conflict path errors with no published recovery, and `syncInterval` is silently
dropped in the offline branch of the pinned version — both **code-derived from a newer revision
than the one pinned**, and both cheap to confirm with a prototype before committing.
*Maintenance impact:* a legacy flag's maintenance is whatever the vendor decides it is; the
absence of documentation means every future question about it is answered by reading their
source again.

**C — Default embedded replica; offline reads only, no offline writes.**
*Advantages:* the simplest, best-documented, production-supported configuration; microsecond
local reads; no conflict model to design because there is only ever one writer path.
*Disadvantages:* **it trades the Constraint.** An operator with no network can look up a tenant
and cannot record a payment — for a rents tracker that is close to the primary action.
*Risks:* the trade is discovered by users rather than by us if it is made implicitly.
*Maintenance impact:* the lowest of the four by a wide margin.

**D — Local SQLite stays of record; the hosted database is a target this repository syncs to.**
*Advantages:* today's architecture is preserved exactly — every ADR resting on a local file
stays true, and offline-first is untouched; it is the smallest change to what exists.
*Disadvantages:* sync becomes this repository's to write, and multi-device convergence with it;
that is the problem the other three options buy rather than build.
*Risks:* a hand-written sync layer is where correctness bugs live, and this repository already
has one whole-file sync mechanism whose fate is decision 07.
*Maintenance impact:* highest ongoing cost, and it is cost this repository carries rather than
the vendor.

## 11 — prototype(persistence): confirm the chosen client against a live database

Status: open — **this is the gate, and invoking it is the user's**
Part of: map
Type: prototype
Blocked by: 10 (decided)

Decision 01 was answerable from documentation and source. What remains is not: every question
below is a fact that only running code against a live Turso account establishes, which is why it
is a prototype rather than a second research run — and it needs credentials this session does not
have and should not create.

What it has to settle, in priority order:

1. **Can `@tursodatabase/sync` target a database this application can create?** The
   documentation shows `turso://` URLs throughout and never states whether a `libsql://`
   database can be a sync target. If it cannot, choosing offline writes also means choosing the
   early-preview engine, and decision 10 is a different decision than the one recorded.
2. **What last-push-wins actually does to a losing writer's record.** Two devices, same
   workspace, both offline, both editing one contract, both pushing. Whether the loss is per
   statement, per row, or per field decides whether this is survivable for a payments ledger,
   and it decides how much of ADR 0026's reasoning survives.
3. **What a genuinely offline first launch does** with `bootstrapIfEmpty` false — the documented
   path requires the remote reachable on first connect, which a fresh install on a disconnected
   machine does not have.
4. **The two code-derived claims about the fallback**, so option B is known rather than assumed:
   whether `offline: true` still drops `syncInterval` in the pinned version, and what recovery
   from its conflict error actually looks like.
5. **What a reconcile pass costs over the wire.** The whole-table pass runs at every application
   start and both paths write one `UPDATE` per changed row, sequentially awaited. With a
   documented per-commit added-latency ceiling, this is the number that decides whether the
   architecture is usable before anything is built on it.

Throwaway code goes to `src/lib/prototype/` and is deleted ([[rules/prototyping]]); the
write-up is what is kept.

## 02 — grilling(repository): what the monorepo's layout and tooling are

Status: open
Part of: map
Type: grilling
Blocked by: —

**Question.** Today there is one package at the root — SvelteKit, with a `tauri/` directory
beside it — plus changesets and a release workflow built around exactly that shape. What
replaces it: which workspace tool, where the shared schema lives so client and API both consume
one description, how the Tauri build finds its frontend, and what happens to changesets and the
release workflow when there is more than one publishable thing. This is a prefactor: everything
else on this map lands inside whatever it decides.

## 03 — grilling(persistence): what a user is, and where the control plane lives

Status: open
Part of: map
Type: grilling
Blocked by: 01

**Question.** What a user record holds, how they authenticate, and whether the control plane is
built here or is a hosted identity service. Also: what the request context becomes, given it
carries no identity today and every procedure in the application is written against a context
that never needed one.

## 04 — grilling(persistence): how a permission bitfield is stored

Status: open
Part of: map
Type: grilling
Blocked by: —

**Question.** The proxy reads every `INTEGER` as an `i64` into a JSON number, which arrives in
JavaScript as a double — exact only to 2⁵³−1. A single 64-bit bitflag column therefore offers
53 usable bits before **silent** precision loss, and the persistence Context's promise that an
unmappable value fails the query does not cover it, because nothing fails: the value rounds on
the far side. Options include several integer columns, a text or blob representation, a row per
granted permission, or capping the flag set below the ceiling. This is answerable now and does
not wait on 01.

## 05 — grilling(api): where the domain runs once organizations arrive

Status: open
Part of: map
Type: grilling
Blocked by: 01

**Question.** A client that writes to a local replica offline necessarily holds a credential
good for that whole workspace database for the length of the offline window. So a bitflag
permission model **cannot be enforced** against an offline client: the enforcement point would
have to be a server it is by definition not talking to, and removing a member cannot take
effect until they reconnect.

Three shapes, and one has to be chosen before organizations are designed: membership grants
full access and roles govern administration only; the domain moves behind the API for shared
workspaces and ADR 0002 is reversed for them; or shared workspaces simply do not get an offline
replica. What this effort owes the answer is a seam that makes it a change rather than a
rewrite.

## 06 — grilling(persistence): who applies migrations to a hosted workspace

Status: open
Part of: map
Type: grilling
Blocked by: 01

**Question.** Rust owns applying migrations today and the TypeScript side never runs them
against the app's database. With the database hosted and several client versions able to
connect, that ownership has to move somewhere — the API, the client on connect, or a deploy
step — and whichever it is has to answer what an older client does when it meets a newer
schema.

## 07 — grilling(sync): what becomes of Google Drive sync

Status: open
Part of: map
Type: grilling
Blocked by: 01

**Question.** A hosted remote of record makes Drive redundant as a sync mechanism while leaving
it plausible as a user-owned backup. Whether it survives, becomes an export path, or is retired
decides the fate of a large and carefully-built Rust surface — the manifest, conflict analysis,
retention, the link session, and ADRs 0003 and 0005 with them.

## 08 — grilling(platform): what a non-desktop client does for host capabilities

Status: open
Part of: map
Type: grilling
Blocked by: 02

**Question.** `Host` is typed as the Tauri facade, so a browser client has no host at all —
export, diagnostics, settings and the updater all live behind it. What the port looks like for a
client that is not the desktop shell, and which capabilities simply have no meaning there.

## 09 — grilling(design): which accepted decisions survive

Status: open
Part of: map
Type: grilling
Blocked by: 01, 05

**Question.** ADR 0010 argues whole result sets from "there is no server"; ADR 0012 trusts the
cache on the ground of three enumerable writers; ADR 0026 rejected a durable journal because a
workspace is one syncable unit resolved by choosing a side; ADR 0005 detects concurrency rather
than preventing it; ADR 0003 puts credentials in Rust, which a browser does not have. Each is
either still true under the new premise, or is superseded here with its reasoning stated afresh.
The repository Context's first Boundary — "There is no server" — changes with them.

Effort #487's tickets #492, #493, #494 and #495 carry a standing warning to be re-read against
whatever this decision produces.
