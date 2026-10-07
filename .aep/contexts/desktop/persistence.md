---
paths:
  - apps/desktop/src/lib/platform/database/**
  - apps/desktop/tauri/src/database/**
  - apps/desktop/tauri/src/persisted.rs
  - packages/workspace-migrations/**
use-when: "the request touches the schema, migrations, or how queries reach SQLite"
---

# Persistence

How data is described once and reaches SQLite. The description lives in TypeScript and the
engine lives in Rust, and the two meet at Tauri's IPC boundary. **The migration runner is in
Rust and applies over the wire**: a workspace's schema is applied to its database on the
organization's account by whichever member creates or opens it, through the database's own
pipeline endpoint (`tauri/src/organization/lease/apply.rs`), and arrives on every other machine as
replicated pages. *It was the control plane's, at the token mint, until 2026-09-12.*

## Language

**Schema**:
The single description of an entity — its table, its validation, and its inferred type,
defined together. Routers derive their input shapes from it rather than restating fields.

**Migration**:
A generated SQL file applied once, in order, and recorded so it is never applied twice.
Generated from the schema, never hand-authored ahead of it — **and hand-finished after it,
which is a step rather than an exception.** No shipped file carries drizzle-kit's
`PRAGMA foreign_keys=OFF`; they were deleted by hand, and they are deleted from the next
generated file too. *That hand-finishing was owed to the Rust runner, which parsed each file with
`sqlparser` and failed the whole file on the pragma at line one — **and that runner is gone**
(#568). Whether the wire runner would accept one has never been tried, so the step is kept
rather than reasoned away.* Where a migration also has to *move* data — 0003
rewrites every primary key — the generated copy is what gets rewritten, not a starting point that
gets replaced.

**The TypeScript suite will not catch either.** `memory.ts` applies migrations with
`better-sqlite3.exec` over the raw file text, which is a third way of applying them and answers
for no other; the desktop's `workspace_live` test applies them through the Rust runner on the
account. *A TypeScript runner's test in `packages/turso-platform` ran them against a real libSQL
file until effort 840 removed that package, imported by nothing.*

**Step**:
One move a database makes, numbered by the version it brings the data to, which is the numbering
its floors are in: a workspace's migration `0000` is step 1 and `0006` step 7, and an
organization's change from format 1 is step 2. Every step is declared in
`tauri/src/database/step.rs`, beside its SQL and never in it ([[rules/migrations]]), as one of
**two kinds**. An **addition** creates a table or an index, or adds a column that may be empty or
has a default, and changes the meaning of nothing an older build reads or writes: it moves neither
floor, and any machine whose build ships it runs it the first time it meets the data. An
**upgrade** is everything else, a drop, a rename, a rebuild, a re-signing, or an addition whose
meaning an older build would get wrong: it declares the floors it raises and whether it needs the
owner's key, and runs only when a holder of `upgradeData` chooses it
([[contexts/desktop/organization]], *Upgrade*). A meaning change that only adds a column is split
into the two.
**The steps shipped before effort 857 still run on open**, as 0.20 ran them (`shipped_before_857`,
read by `Step::runs_on_open`): `0000` to `0006`, by the first member with full access to open the
workspace, under the lease, and the changes of format up to 3, on the owner's machine at their
sign-in, resume or connect. Each is declared an upgrade with both floors at its own number, which is
what every build before 857 enforced by refusing any rise, and data in users' hands stands behind
them. The rule that an upgrade waits for somebody to choose it binds every step declared after.
*Effort 857, requirements 1 and 2, requirement 1 as amended at /implement.*
_Avoid_: "upgrade" for a step that runs on open by itself.

**Floors**:
What a database is judged by, three numbers in the numbering of its steps (`database/floor.rs`): its
**level**, the step it has taken, additions included; its **read floor**, the step a build must know
to read it; and its **write floor**, the step a build must know to write it. A build knowing step
`known` is **writable** at or above both, **read-only** at or above the read floor and below the
write floor, and **unreadable** below the read floor, whatever the level, so a build is never
refused for being behind a step that moved no floor. Data from before effort 857 has no floor
record and reads as floors equal to its version, so a workspace at 7 reads `{7, 7, 7}`, and nothing
is written to make it so (requirement 13). The **floor record** is a workspace's one-row
`data_floor`, beside its `schema_version` row, and the organization's `organization_floor` and
`workspace_floor` rows ([[contexts/desktop/organization]]); data created on a build that ships a
step declared after 857 is created with it, holding the floors its steps declare (effort 857,
ticket 21), older data gains it from the first such step to run on it, holding the floors read
before it, and after that only the explicit upgrade moves it. Where the workspace's own record and the organization's disagree, the lesser verdict
stands (`Standing::least`).
_Avoid_: "the version" for the floors; nothing is refused for being newer or older, only for being
below a floor.

**`applied_step`**:
The table listing each step a workspace ran above its `schema_version`. An upgrade waiting for
somebody to choose it is passed over and the additions after it still run, so what has run stops
being a prefix: `schema_version` keeps meaning every step up to it has run, and the check against a
fresh database builds that database from the steps up to it and the ones listed (`apply::fresh_of`).
It and `data_floor` are made with the first step declared after 857 to run, so a workspace only
0.20's steps have reached holds neither, exactly as 0.20 left it.

**Legacy number**:
What a build from before effort 857 reads and refuses on any rise: the organization's record of a
workspace, `workspace.schema_version`, and the organization's own `format` row. It follows the steps
shipped before 857 and stops there (`Steps::settled`), so an addition never moves it; the explicit
upgrade moves it only where a floor passes what any of those builds knows, and then to the higher
floor, which every one of them refuses (`Steps::legacy_after`). That is the one way to stop a build
that knows nothing of floors. A build from 857 on reads the floor record where there is one, and the
legacy number as floors equal to it where there is not.

**Transport**:
What carries a query to the engine. Production goes through IPC to Rust; tests go through
an in-memory engine that is type-identical to it.

The two share the row *reshaping* in `client.ts` and nothing below it. **Value conversion is
per-transport**, and both halves convert by the storage class SQLite reports for the value:
Rust reads it explicitly, better-sqlite3 by returning native values. Neither consults the
type a column was *declared* as — that type is absent for every expression, and dispatching
on it is what made a selected aggregate arrive as null (#287).

**A value whose storage class the conversion cannot map fails the query.** Nothing degrades to
null, because a null is indistinguishable from a column that was null and hides the gap that
produced it.

**That promise is about storage classes, not value ranges, and the difference is load-bearing.**
An `INTEGER` maps fine and then loses precision further down: both transports return integers as
JavaScript doubles, exact only to 2⁵³−1, and **neither errors** — `better-sqlite3` returns a lossy
number, and Rust's exact `i64` degrades at `JSON.parse` on the far side of the IPC boundary.
Measured on both, 2026-08-17: `9007199254740993` reads back as `9007199254740992`. So a column
that can exceed 2⁵³−1 is silently wrong, and no guarantee here covers it. The two transports
agree exactly, which is the one piece of good news — a router test pins this faithfully, unlike
the asymmetric cases below.

**Persisted record**:
A small JSON file the engine keeps beside the databases rather than in one: `settings.json`, and
`remote-sync.json`, which holds every organization this machine knows. Read and written through
`Persisted` (`tauri/src/persisted.rs`).
_Avoid_: a store, which here is the organization's replica

**Only Rust tests reach the Rust half.** The TypeScript harness executes under Node, so a
router test can pass over a conversion that is broken in the running application.

## Boundaries

- **The schema module is the single source of truth.** Table, validation, and type change
  together in one place; a change to one of the three without the others is a defect, not a
  partial edit.
- **Nothing on this machine applies a migration to the replica.** A workspace's schema is applied
  to its database over the wire, at creation, and under a lease when it is opened with a step it has
  not taken that runs on open (a step shipped before 857, or an addition); an upgrade declared after
  857 is applied only by the explicit upgrade, under the same lease (`organization/upgrade/`). The
  replica receives either as replicated pages. It is applied in one transaction with the
  workspace's own `schema_version` row, its `applied_step` and floor record where those are owed,
  and a check against a fresh database of what it then holds, or not at all
  (`organization/lease/apply.rs`, `schema/`); inside that transaction a `PRAGMA foreign_keys` would
  be a no-op, which is one more reason none ships. The TypeScript side here generates migrations
  and never runs them against the app's database; `tauri/migrations/` is a build-time mirror
  `build.rs` counts to produce `WORKSPACE_SCHEMA_VERSION` and embeds for the runner. **A build is
  refused a workspace only below its read floor**, and read-only below its write floor, never
  merely for being older than its level. *It said a build older than a workspace's recorded version
  refused to open it until effort 857, when the version stopped being the verdict.*
- **The verdict is judged at every way in, after a pull, and held on the engine.** A workspace is
  judged from the organization's record of it before its replica is named (`lease::refuse_newer`),
  and again from its own record once its replica has pulled (`organization/workspace/open.rs`,
  `session::workspace_judged`), and every heartbeat judges it again, after the organization's pull
  and before anything of the workspace is pushed (`session_replicate`). The verdict is kept on `Database` (`hold`, `standing`). Below the read floor the
  workspace is not opened: the workspace-held screen stands in its place, inside the application
  (`startup/component/workspace-held.svelte`), saying a newer rentable upgraded it, carrying the
  update action, and listing the session's other workspaces to switch to. *Effort 857,
  requirements 7 to 9.*
- **Read-only is enforced where writes cross into the engine, not in the interface.** While the
  verdict is read-only, every statement through `execute_single_sql` and `execute_batch_sql` runs on
  a connection held with `PRAGMA query_only` (`floor::hold_writes`), so the engine refuses a write
  and serves a read, measured on the engine as built, and the refusal is answered as
  `WorkspaceReadOnlyByVersion`; nothing is pushed (`push_replica`), so what was captured before the
  floor rose waits for this machine to update. The shell draws the read-only notice with the update
  action ([[contexts/desktop/organization]], *Held by a version*). *Effort 857, requirement 6.*
- **Every query crosses the boundary as data** — statement, parameters, and the kind of
  result wanted. Nothing else about the engine is visible to the caller.

## Constraints

- **A transaction crosses the boundary as a batch, and only as a batch.** The batch command
  opens a transaction, runs every query inside it, and commits at the end; the single-query
  command refuses `BEGIN`, `COMMIT` and `ROLLBACK` outright and directs the caller to batch
  execution instead. The test transport does the same, so a router test over a batch
  exercises the atomicity production has. **A write that must not half-apply issues one
  batch** ([[rules/data]], under *Multi-table writes*); a
  multi-step write sequenced as separate queries is still not atomic, and that is a choice
  the caller made rather than a limit of the boundary.
- **A batch is built before any of it runs**, so a statement cannot read an identity an
  earlier statement in the same batch is about to assign. **It no longer has to**: an
  identity is minted by whoever creates the record, so it is known before the batch is built
  and every statement in one can state it outright. *Until #541 this was a real constraint,
  and the shapes it forced are worth knowing because they are gone: creating a complex with
  its units named the complex by its own unique name in a subquery, and importing a whole
  workspace read the highest id in use per concept and allocated a contiguous block from it.
  A batch that still cannot branch on its own results is the part that has not changed.*
- **SQLite is compiled into the binary, and the driver owns that.** The engine links a
  bundled SQLite rather than a system library, asked for through the driver's own feature
  rather than by naming the native bindings as a direct dependency. Nothing here selects a
  TLS backend for the database: it speaks to a local file, and the TLS stack the crate does
  carry belongs to the HTTP client. Adding a direct dependency on the bindings to influence
  the build is the shape this deliberately does not have — it forces an exact version that
  must then track the driver's own range by hand.
- **A persisted record is never lost to a damaged file, and never written over a good one.**
  *Effort 854, requirement 17.* A write goes to a staging file that is synced to the disk before
  it is renamed over the record, so the record on disk is the old content or the new, never half
  of either. `<name>.bak` is written after the record, never before, and is the last good copy: a
  copy of the content before a write would undo that write if it were restored, and that write is
  often a forget. Content that does not parse is set aside as `<name>.corrupt-<ms>`, the replicas'
  convention, kept rather than deleted, and the record comes back from its `.bak`, or from the
  defaults where there is none; a record whose file has gone comes back from its `.bak` and is
  written back from it before anything else. A file the system will not let the application open,
  locked by another process or without permission, is never recovered or written over, since its
  content may be good, and the same holds where the launch cannot write a recovered or defaulted
  record back: the launch names the file, in Arabic and English, with what to do, in the operating
  system's own message and stops, and the reason goes to the log under `startup.failed`. The log
  says which of these happened (`persisted.*`).
