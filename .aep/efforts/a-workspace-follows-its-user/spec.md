---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: accepted
---

# Problem

A workspace is a file on one machine, and the application has never asked who is using it.

The database is local SQLite and it is of record. The only way a workspace reaches a second
machine is a Google Drive exchange of whole-file snapshots, resolved when the two sides
disagree by choosing a side ([[rules/drive-concurrency]]). The request context carries a
database, a clock and a host and nothing else (`src/lib/api/context.ts:36`); the schema has no
user table and no ownership column anywhere.

**The domain has never asked who. The application has.** That distinction was blurred until
2026-08-17, and it matters: `RemoteSyncAccount` already carries an `id`, `email`, `display_name`,
`avatar_url`, `provider_user_id`, `token_expires_at` and `refresh_token_available`, and
`tauri/src/sync/google/auth.rs` implements OAuth 2 with PKCE and refresh behind the credential
boundary [[rules/drive-client-boundary]] describes. So identity is **not** built from nothing —
there is a working sign-in flow, an account shape, and a place credentials already live safely.
What is genuinely absent is identity reaching the *domain*: the schema and the request context.

So a person who owns rental property and works from more than one machine has no account, no
way to reach their workspace from a machine they have not linked by hand, and a recovery story
that is a file copy. Three costs follow:

- **The application is bound to a device rather than to its user.** Losing the machine is
  losing the workspace unless a link was set up in advance and a sync happened to be current.
- **Every future client kind is unreachable.** A web or mobile client cannot be added without
  first answering who a user is and where the record of truth lives, so the question is not
  deferred by not asking it — it is only made more expensive.
- **Organizations are unreachable for the same reason.** Multiple people on one property
  portfolio needs identity, membership and a shared record of truth, none of which exist.

**And this is not a greenfield application.** rentable has shipped since at least April 2026 —
five public releases, `v0.12.0` most recently — and it ships with an updater that delivers new
versions to machines already running it. Every one of those installs holds a local SQLite
workspace that is currently of record, and some are linked to a Google Drive folder. Whatever
this effort does arrives on those machines through an update the user did not opt into by
reading a spec. **The problem therefore includes the installed base**, and an approach that only
describes what a fresh install does has answered half of it.

# Goal

A **hosted** workspace follows its user: they sign in once and find it on whichever client they
opened. A hosted workspace is a database of its own — of record remotely, replicated locally —
and the application stays fully usable with no network.

**A local workspace stays exactly what it is.** Where the record of truth lives becomes a
property of the workspace rather than of the application, and both values are first-class: a
user may keep a local workspace forever, without an account, and nothing about this effort
degrades it. An existing install crossing this update keeps working with no action taken.

When this lands, a second client kind could be added and organization workspaces could be added
without reopening any decision made here. **Neither is built.**

# Scope

- **Two records of truth, both first-class.** A workspace is local-of-record or hosted-of-record,
  and the application supports both for as long as both exist. This is the decision that shapes
  every other item in this list: each one below answers for two modes, not one.
- **The adoption path.** What an existing local workspace does when the update arrives (nothing,
  by requirement), and how a user converts one to a hosted workspace when they choose to.
- **Identity, and it starts from Google.** A user record, how long a session lasts, and what the
  request context carries as a result — including what it carries when there is no user because
  the workspace is local. **How they authenticate is directed as of 2026-08-17: sign in with
  Google**, reusing the OAuth 2 + PKCE flow, refresh handling and account shape that already
  exist in Rust. Decision 03 works out what that means for the user record and the control plane;
  it does not reopen the choice of provider.
- **The control plane.** Users, workspaces and membership: one always-online multi-tenant
  database, whether this repository builds it or buys it.
- **Workspace persistence.** A hosted database of record with a local replica, reached through
  the transport seam that already exists — `createDatabase(single, batch)` at
  `src/lib/platform/database/client.ts:47` takes two function types, production passes Tauri's
  `invoke` and tests pass an in-memory engine, and a hosted workspace is a third caller at that
  same seam.
- **The workspace discriminator.** `provider` is `local | googleDrive` today and is load-bearing
  in the sync flows (`src/lib/sync/workspace.ts:32`). A hosted workspace is a third value of it,
  and every flow that branches on it answers for the new one.
- **Migrations against a hosted workspace.** Who applies them, and what a client older than the
  schema it meets does about it.
- **Google Drive sync's fate**, now constrained: a local workspace's only route off its machine
  is Drive, so whatever Drive becomes has to keep serving local workspaces for as long as they
  are first-class.
- **The rules resting on "there is no server."** Which survive the premise change, which are
  **scoped to local workspaces** rather than superseded, and the first Boundary of
  [[contexts/repository]] with them.

# Requirements

1. **An existing local workspace survives the update untouched.** After the new version arrives
   through the updater, the application opens the same workspace, with the same data, and needs
   no account and no action from the user.
2. **An installation holds exactly one workspace, and that workspace has a mode.** It is
   local-of-record or hosted-of-record, both are first-class, and a user may keep it local
   indefinitely without an account. Converting changes the mode of the one workspace; it does not
   produce a second one.
3. **A hosted workspace has an owner, and authenticating establishes who they are.** An account
   is required for a hosted workspace and for nothing else — a local-only user never creates one,
   and the application knows of no user at all in that case. *Reworded 2026-08-17: the previous
   phrasing opened "a user has an account", which is false for exactly the population requirement
   2 exists to protect.*
4. A user's hosted workspace is reachable from any device that user signs in on, with no file
   copied and no per-device link step.
5. A hosted workspace is one database, of record remotely, with a local replica that serves
   reads.
6. **A user may convert a local workspace to a hosted one**, deliberately, losing nothing.
7. The application remains fully usable with no network, in both modes — reads **and** writes.
   **This is hard, and confirmed as hard on 2026-08-17.** A hosted workspace that cannot record
   a payment without signal does not satisfy this effort, and shipping one is not an available
   outcome. The consequence is written into decision 11: if no client delivers offline writes
   against a hosted database, **the hosted architecture does not ship** and the effort stops
   rather than degrading.
8. Divergence between two devices on one hosted workspace resolves without silent,
   unreportable loss.
9. The database client type does not fork. A hosted workspace is a third transport at the
   existing seam, not a second persistence layer.
10. The request context carries identity **when the workspace is hosted**, and every procedure
    needing the acting user takes it from there rather than from an argument a caller supplies.
    A local workspace's requests carry none, and no procedure breaks for want of one.
11. A hosted workspace's schema has one named owner who applies migrations, and a client meeting
    a schema it does not understand refuses in a way the user can act on. A local workspace's
    migrations stay Rust's, as they are today.
12. Google Drive's fate is decided **and executed** — the surface is not left running with no
    stated purpose — and whatever it becomes still serves local workspaces.
13. Every rule and boundary resting on "there is no server" is restated as still true, scoped
    explicitly to local workspaces, or superseded with its reasoning written afresh.
14. Organization workspaces are not built, and nothing built here forecloses them.

# Acceptance Criteria

1. **Install `v0.12.0`, populate it with contracts and payments, link it to Drive, then update
   to the new version through the real updater.** Every record is present, every surface works,
   no sign-in is asked for, and the Drive link still syncs. **This is the criterion that
   protects people who already use the application, and no CI run can stand in for it** — it
   needs a real installed build and a real update, exactly as the monorepo effort's release
   criterion does.
2. The workspace's mode is visible to the user and choosable by them — neither mode is reached
   only by editing configuration. `RemoteSyncState.workspace` stays singular and the application
   still opens one database file; a search of the tree finds no workspace list and no switcher.
3. Creating a hosted workspace requires an account; creating or opening a local one never
   prompts for sign-in at any point.
4. On a clean install, signing in with valid credentials reaches that user's hosted workspace;
   invalid credentials do not, and the refusal says what to do. Signing out and back in on the
   same machine restores the same workspace.
5. A hosted workspace created on machine A is present, with its data, on machine B after signing
   in as the same user — no snapshot exported, no folder linked.
6. Converting the workspace from local to hosted moves every record, and a row-count and
   spot-value comparison before and after matches. **The old local file is left on disk as a
   safety copy, not as a second workspace** — the application opens the converted workspace and
   does not offer the dormant file as something to switch to. What it does say about that file,
   if anything, is decision 12's.
7. With the network disconnected, every list and record surface renders its data — from the
   local file in local mode, from the local replica in hosted mode.
8. With the network disconnected, recording a payment succeeds in **both** modes; for a hosted
   workspace, after both devices reconnect the payment is present on the second.
9. Where the chosen client resolves divergence by overwriting, a test demonstrates **exactly what
   a losing writer loses** — per statement, per row, or per field — and that answer is written
   into this spec rather than discovered later.
10. `createDatabase` still returns one client type. Production, test and hosted transports all
    satisfy it, and a search of the tree finds no second database client type.
11. A procedure needing the acting user reads it from the context, and
    `src/lib/api/context.test.mjs` covers a request carrying identity and one carrying none —
    the second being an ordinary local-workspace request rather than an error case.
12. Applying a migration to a hosted workspace is a documented path that has been exercised end
    to end. A client older than the workspace schema shows a message naming the action to take,
    and issues no write. A local workspace's migrations are applied by Rust exactly as now,
    demonstrated by the existing Rust migration tests still passing unchanged.
13. Whatever Drive becomes is true in the tree, and **a local workspace's data still reaches a
    second machine and comes back** — demonstrated end to end on two installations, by whatever
    route decision 07 leaves it. *Rewritten 2026-08-17: the previous wording ("can still reach its
    remote by whatever route the decision leaves it") passed whatever decision 07 decided, which
    is not a criterion.*
14. Each affected rule file either states that it still holds, states the mode it is now scoped
    to, or is superseded in place. A search for "there is no server" returns only text that is
    still true when it is read.
15. Each decision below records, in writing, what adding organization workspaces would cost
    against the choice it made. **The promise that none of them forecloses organizations is
    checked by decision 09 and nowhere else**: that grill produces a written sketch of how an
    organization workspace would be added, re-reads every decision on this map against it, and
    the criterion is met when the sketch exists and names nothing that would have to be unpicked.
    *Rewritten 2026-08-17 — the previous wording ("no schema, seam or credential shape is
    introduced that makes them a rewrite rather than an addition") could not fail, had no owner,
    and would have passed by default at review.*

# Constraints

- **No existing install may break, and none may be forced to change.** The update reaches
  machines through an updater, not through a decision the user made about architecture. *Why:
  the application has shipped five public releases and holds real people's rent records; a
  migration that requires an account, a network, or a manual step in order to reopen data the
  user already had is a data-loss event with a friendly name.* This is what makes the local mode
  a constraint rather than a preference.
- **Two modes are a permanent shape, not a transition period.** *Why: it would be cheap to
  treat local-of-record as a compatibility shim to be removed in a later release, and that is a
  different product than the one chosen here. A decision that only works if local is temporary
  is the wrong decision.*
- **Offline-first, in both modes.** The application is fully usable with no network. *Why: it is
  a repository Constraint ([[contexts/repository]]), and recording a payment is close to the
  primary action — an operator standing in a building with no signal who cannot record one has
  lost the product.*

  **The trade was offered and refused, 2026-08-17.** The two-mode decision made a weaker reading
  available — local mode would have carried the Constraint on its own, leaving hosted mode free
  to be online-write — and that reading is **rejected**. Offline writes are required of a hosted
  workspace too. So the escape hatch this Constraint used to carry is closed for this effort:
  there is no longer a version of it that gets traded, only one that gets met or stops the work.
  It is not allowed to erode by accident either, and the cheapest, best-documented configuration
  available is still the one that erodes it.
- **One database client type.** *Why: production and test clients are the same
  `SqliteRemoteDatabase<typeof schema>` and run the same row mapping, which is what lets a
  router test exercise the real boundary. A decision that forks the client type is answering
  the wrong question.* Recorded originally as ADR 0001, and **now a live rule again**:
  [[rules/database-client-type]], restored 2026-08-17.
- **Arabic and English, RTL and LTR, both first-class.** Sign-in, account and error surfaces
  are new surfaces and inherit this.
- **Never `add --overwrite` or `init --reinstall`** on design primitives.
- **Organization workspaces are designed for and not built.** *Why: a decision that makes them
  unreachable is the wrong decision even where it is the simplest one, and this effort is where
  they become reachable or do not.*
- **The transport seam is where the change lands.** *Why: a hosted database is a third transport
  at a seam that already exists; a decision that introduces a new persistence layer instead has
  mistaken the size of the change.*

# Out of Scope

- **The repository restructure.** [[efforts/the-repository-becomes-a-monorepo/spec]] owns it,
  and this effort **depends on it**. That effort is now `accepted` and its layout is known:
  `apps/desktop/` holds the application, the root is private and unversioned, and no `packages/`
  directory exists yet. Its plan defers extracting the database schema into a package until a
  second consumer exists, and **names decision 03 of this effort as the thing that produces
  one** — so decision 03 owes an explicit answer to whether the control plane's schema is a
  second consumer of the domain schema or a separate description.
- **Retiring local workspaces, ever.** Not deferred — excluded. A later effort may revisit it;
  this one is built on both modes being permanent.
- **Converting a hosted workspace back to a local one.** One-way only, unless *Open Questions*
  settles otherwise.
- **More than one workspace per installation.** Settled 2026-08-17 against the alternative: no
  workspace list, no switcher, no per-workspace database paths. `RemoteSyncState.workspace` is
  singular and `Database::FILENAME` is the constant `"app.db"`, and this effort leaves both that
  way. The field `RemoteSyncWorkspace.local_database_path` half-anticipates the other answer and
  is **not** an invitation to take it here.
- **Organization workspaces themselves.** Designed for, not built. Personal workspaces only:
  one user, one workspace per installation, any number of that user's devices.
- **Multiple people editing one workspace.** Follows from the above and is stated separately
  because it is the exclusion most likely to be built by accident once membership is designed.
- **Shipping a web or mobile client.** The destination is readiness, not a second client. No
  package for one is created speculatively.
- **Building or deploying an API service.** Room is made for one; nothing is deployed here. If
  decision 03 lands on a hosted identity service, no service is written at all.
- **The domain model.** Contract statuses, payment rules, unit assignment and the Saudi identity
  forms are untouched.
- **Everything in [[efforts/work-the-surfaces-cannot-do/spec]] (#487).** Deliberately built
  after this one.

# Assumptions

- **The chosen client can target a database this application can create.**
  `@tursodatabase/sync`'s documentation shows `turso://` URLs throughout and never states
  whether a `libsql://` database can be a sync target. Unverified, and it is decision 11's
  first question — if it is false, choosing offline writes also means choosing the preview
  engine, and decision 10 is a different decision than the one recorded.
- **Per-workspace hosted databases are affordable.** The free tier gives 100 databases and paid
  tiers are unlimited, with no documented per-database size cap. Established by decision 01
  against published pricing, not against a bill.
- ~~**The user accepts that the application now requires an account.**~~ **Withdrawn 2026-08-17.**
  It does not require one: an account is required for a hosted workspace and for nothing else,
  and local workspaces stay first-class. The assumption was load-bearing while it stood, which
  is why it is struck rather than deleted.
- **Real users other than the author run the published releases**, so the installed base is a
  population rather than a machine. Stated by the human, 2026-08-17. It is what makes
  requirement 1 and its acceptance criterion first-class rather than an operational note.
- **Every hosted-workspace user has, or will create, a Google account.** Follows from directing
  sign-in to Google on 2026-08-17. It is an assumption rather than a fact because nobody has
  checked it against the actual user base, and for a Saudi rents tracker it is plausible without
  being established. A local workspace is unaffected — it needs no account of any kind.
- **Turso stays the vendor.** No alternative has been evaluated, and this effort does not
  evaluate one.
- **Rust remains present on the desktop client.** Credential handling assumes it
  ([[rules/drive-client-boundary]]); a browser client would not have it, which is why that is an
  open question rather than an assumption.

# Open Questions

- **Where does a workspace credential live on a client with no Rust process?**
  [[rules/drive-client-boundary]] puts credentials in Rust and says there is no second place
  they could be. A browser client has no Rust at all. Nothing here requires answering it for a
  browser client that is not being built — but the seam has to admit an answer.
- **What does an offline client do when its token is revoked or expires?** Decision 01
  established that revocation is bulk-only, rotates every token in the group, and has no
  published propagation time. What an already-connected or offline replica does when its token
  is invalidated is undocumented.
- **What does a genuinely offline first launch do**, before any successful connect has happened?
  The documented path wants the remote reachable on first connect, which a fresh install on a
  disconnected machine does not have.
- **Is three days the session window, or a placeholder?** The map records three days without a
  connection before a session goes stale and requires one. Whether that is a requirement or a
  first guess has not been settled, and it is a product decision rather than a technical one.
- **What does a reconcile pass cost over the wire?** Both reconcile paths write one `UPDATE` per
  changed row, sequentially awaited, and the whole-table pass runs at every application start.
  Against a documented per-commit added-latency ceiling of 100/50/25/10 ms by plan, this is the
  number that decides whether the architecture is usable. Decision 11 measures it.
- **Is the conversion one-way?** *Out of Scope* says hosted-to-local is not built, which is the
  cheaper answer and may be the wrong one: a user who stops paying, loses trust in the vendor, or
  simply changes their mind has no route back, and the vendor risks recorded below make that a
  live scenario rather than a hypothetical. Deciding it is a product call.
- **Does a local workspace get an account-free identity at all?** A user with only local
  workspaces never signs in, so the application has no idea who they are — which is correct today
  and may not survive undo, diagnostics, or anything else that wants to attribute an action.
- **What does the mode choice look like the first time a new user opens the application?** A
  fresh install with no workspace now has a fork in front of it that it has never had, and
  presenting it badly makes the account feel mandatory when it is not.
- ~~**Where does ADR 0001 live now?**~~ **Resolved 2026-08-17.** It is
  [[rules/database-client-type]], restored from `.claude/decisions/` in history and verified
  against the tree first: `memory.ts` does build its client through `createDatabase`, and
  `seed.ts`/`purge.ts` are still on `drizzle-orm/better-sqlite3`, so the rule's obligation and
  its named exclusion both still hold.

# Risks

- **The chosen client is pre-1.0 and in early preview on Turso Cloud.** This puts the foundation
  of the whole application on a preview offering, and a breaking change in it is a change to the
  layer everything else stands on. It shows up as an upgrade that cannot be taken and cannot be
  refused.
- **Last-push-wins overwrites a losing writer's values silently, per statement.** For a payments
  ledger that is a data-loss shape rather than a merge policy, and it is worse than the
  whole-side resolution the application has today. It shows up as a payment that was recorded
  and is not there, with nothing to point at.
- **Offline-first erodes by accident, and that is now a violation rather than a trade.** Option C
  is the simplest, best documented and production-supported configuration, every pressure during
  implementation points at it, and it has been explicitly rejected — so drifting into it is not a
  decision anybody may make quietly at build time. It shows up as a hosted workspace that reads
  fine offline and fails to save, discovered by a user with no signal.
- **The hosted architecture can fail its gate, and the effort has agreed to stop rather than
  degrade.** Requirement 7 is hard and decision 11 is go/no-go, so a prototype that comes back
  negative on both clients does not produce a smaller hosted mode — it produces no hosted mode.
  It shows up as months of decisions (03, 05, 06, 07, 09, 12) that were all blocked on a gate
  that then closed. **The mitigation is to run decision 11 before working any of them**, which is
  what its priority order already says and what the sizing has said since the spec was written.
- **The update that reaches existing machines is the highest-consequence moment in this effort.**
  It arrives unprompted, on machines holding real rent records, through an updater. Everything
  else here fails in front of someone who chose to try it; this fails in front of someone who
  chose nothing. It shows up as an application that opens to a sign-in screen where a workspace
  used to be.
- **Two permanent modes double the surface every decision has to answer for**, and the second
  mode is the one nobody is excited to build. It shows up as local-of-record quietly rotting —
  a path that still compiles, is never exercised, and breaks in a release nobody tested it in.
  The mitigation belongs in the testing strategy `/plan` writes, and it is the reason acceptance
  criteria 7, 8 and 12 name both modes explicitly.
- **Identity and backup now share one provider, and one of them may be leaving.** Sign-in is
  Google and Drive sync may be retired by decision 07 — so the application would keep a Google
  dependency for authentication while removing the feature that dependency was originally built
  for. It shows up as a user asked to connect Google for a Drive backup they no longer get, or as
  an OAuth scope set that outlives its justification and nobody prunes.
- **Requiring a Google account excludes whoever does not have one**, and unlike the account
  requirement generally, this one cannot be answered with "then use local mode" for a user who
  specifically wants their workspace on two machines. It shows up as a user who wants the product
  and cannot have it for a reason unrelated to rent.
- **Turso's schema-propagation feature is deprecated for new users** — the one feature built for
  exactly the per-workspace shape this effort chose. It shows up at decision 06 as an absence
  rather than an obstacle.
- **Nine open decisions are a lot of unresolved architecture for one spec.** It shows up as a
  plan that cannot be written until several sessions have run, which is why the sizing below
  reports the top floor and stays there.

# Architecture

**This section is deliberately partial, and the boundary is stated rather than implied.**
*Written 2026-08-17.* It covers only what holds **whichever way decision 11 lands** — including
if the gate closes and no hosted workspace ever ships. Everything downstream of the gate
(the control plane, migrations, Drive's fate, the local-to-hosted conversion) is **absent, not
omitted**: decisions 03, 05, 06, 07 and 12 own it, and writing it now would be guessing at an
architecture that may be deleted rather than revised.

Four things are settled by the code that exists, and each was checked in the tree rather than
recalled.

**A hosted workspace is a third caller at a seam that already exists.** `createDatabase(single,
batch)` (`src/lib/platform/database/client.ts:47`) takes two functions and returns one
`SqliteRemoteDatabase<typeof schema>`; production passes Tauri's `invoke` (`:61`), tests pass an
in-memory engine (`memory.ts:63`). Whichever client decision 11 selects is **wrapped into those
same two functions**. The gate decides the *body* of `single` and `batch`, never their shape —
which is why [[rules/database-client-type]] can be obeyed before the gate is known, and why
acceptance criterion 10 is not waiting on anything.

*Rejected, and named so it is not re-proposed:* a second client type for hosted workspaces. It
is the change [[rules/database-client-type]] exists to forbid, and it would end the property
that makes router tests worth running — that the test client and the production client run the
same row mapping.

**The mode is a third value of a discriminator that is already load-bearing.**
`RemoteSyncProvider` is `Local | GoogleDrive` (`tauri/src/sync/store.rs:32`), `#[default] Local`,
`#[serde(rename_all = "camelCase")]`, mirrored in TypeScript at `src/lib/platform/tauri.ts:37`.
Adding a `Hosted` variant is **additive to the serde representation**: an existing install's
persisted store contains `"local"` or `"googleDrive"` and continues to deserialize unchanged.

**This is what makes requirement 1 hold structurally rather than by care**, and it is worth
stating plainly because it is the requirement with the highest consequence: an existing install
that knows nothing of this effort deserializes to `Local`, which is exactly what it was, because
`Local` is both the existing value and the default.

**Identity is an optional field on a context that is built by defaulting.** `Context` is
`{ db, clock, host }` (`src/lib/api/context.ts:36`), and `context()` already supplies each
dependency from an override or a real capability (`:52`). Identity enters as a fourth member
that is **absent in the ordinary case**, not an error case — a local-only user never signs in,
and requirement 3 makes that population the one being protected. What a user *holds* is decision
03's; that the field is optional is already directed and does not wait on the gate.

*Rejected:* a required identity with an anonymous placeholder for local workspaces. Decision 03
already names it as "the harder of the two failures" — it makes every local request carry a
fiction, and the fiction is indistinguishable from a real user at every call site.

# Components

*The unconditional half only. Each row was read in the tree.*

| Component | Where | What changes |
| --- | --- | --- |
| the transport seam | `src/lib/platform/database/client.ts:47` | **Nothing.** It already admits a third caller; this is recorded so it is not "improved" |
| the mode discriminator | `tauri/src/sync/store.rs:32`, mirrored `src/lib/platform/tauri.ts:37` | one added enum variant, on both sides of the boundary |
| the flows that branch on it | `src/lib/sync/workspace.ts:32,50,75,84,121,127`; `src/lib/sync/pending-conflict.ts:42` | **seven call sites**, each of which must answer for the third value |
| the request context | `src/lib/api/context.ts:36` and its builder at `:52` | one optional member |
| the host port | `src/lib/api/context.ts:27` | decision 08's inversion, if taken |

**Seven is the whole population, not a sample.** Every site was found by searching for the
discriminator rather than by memory, and the count is recorded so that a later reader can tell
whether the tree has moved under this plan.

# Migration

**The migration this effort must survive is not one it performs.** It is the updater delivering
a new version to a machine that holds real records and made no choice about architecture — the
single highest-consequence moment in this effort, per *Risks*.

What makes it safe is stated above and is structural: `RemoteSyncProvider::Local` is the serde
default *and* the existing value, so a persisted store written by `v0.12.0` deserializes into
the new enum untouched. `Database::FILENAME` stays `"app.db"` and `RemoteSyncState.workspace`
stays singular, both by *Out of Scope*. **No data migration runs, because nothing about an
existing local workspace changes.**

A local workspace's migrations stay Rust's, exactly as now — that is requirement 11's second
half, and it is the half that does not wait on decision 06.

The local-to-hosted conversion is **decision 12's and is not planned here.**

# Testing Strategy

*The unconditional half. How each criterion that does not wait on the gate gets checked.*

| AC | Checked by |
| --- | --- |
| 1 | **Manual, and unavoidably so.** Install `v0.12.0`, populate it, link it to Drive, update through the real updater. No CI run substitutes for it — it needs a real installed build, a real update, and a real populated workspace, exactly as the monorepo effort's release criterion does. It is also the criterion that can be run **before any hosted work exists**, and should be |
| 2 | A search of the tree for a workspace list or switcher, returning nothing; plus that `RemoteSyncState.workspace` is still singular and `Database::FILENAME` still `"app.db"` |
| 10 | A search of the tree finding one database client type, and the existing router tests still passing over `createMemoryDatabase()` unchanged — the second being the real check, since it is what a forked client type would break |
| 11 | `src/lib/api/context.test.mjs`, which already exists, covering a request carrying identity **and one carrying none** — the second being an ordinary local-workspace request rather than an error case |
| 12 (local half) | The existing Rust migration tests, still passing **unchanged**. Unchanged is the assertion; a passing rewritten test proves nothing here |
| 14 | A search for "there is no server" returning only text that is still true when read. Decision 09 owns the rewriting; this is how the result is checked |

**The mode nobody is excited to build is the one that rots** — *Risks* says so, and it is why
criteria 7, 8 and 12 name both modes explicitly. The mitigation belongs here: **every criterion
above is a local-mode criterion**, and all of them are runnable today, before a line of hosted
code exists. Running them early is what keeps local-of-record from becoming a path that still
compiles and is never exercised.

**Two criteria in this table cannot be automated at all** — 1 entirely, and the tree searches in
2, 10 and 14 only partly. They are named so a green suite is not mistaken for a met spec.

# Decisions

**What `status: accepted` means here, and what it does not.** Accepted 2026-08-17, after
`/refine` reached its floor. It settles the WHAT and the WHY: the problem, the goal, the scope,
fourteen requirements and the fifteen criteria that check them, the constraints, and the
boundaries. **It does not settle the HOW**, and the HOW is now **partly** written.

*Corrected 2026-08-17.* This paragraph used to say there was no `# Architecture` section and
would not be one until decision 11 had run, "because every architectural piece in this effort
sits downstream of" the gate. Tested against the code rather than repeated, **that was
overstated.** Four pieces are not downstream of it — the transport seam, the mode discriminator,
the optional identity on the context, and the local-mode testing strategy — and they are now
written, above, explicitly scoped as the half that holds whichever way the gate lands. The claim
was true of everything that *builds a hosted workspace*, which is most of the effort, and it is
still true of decisions 03, 05, 06, 07 and 12.

**The partial architecture cuts no tickets, and that is not a defect in it.** Adding an enum
variant nothing constructs, and an optional field nothing populates, has no observable outcome —
so under [[rules/tracker]] there is no branch to cut and nothing for [[skills/implement]] to
take. It is written because it is *true now*, because writing it early is what stops it being
decided by accident during the hosted work, and because acceptance criterion 1 can be run today.

**Accepting does not make requirement 7 achievable.** It is hard, decision 11 is a go/no-go, and
a negative result ends the hosted half of this effort. If that happens the spec is changed
deliberately under [[policies/execution]] rather than quietly relaxed — the requirement is what
would be renegotiated, in the open, and the local-mode half stands either way.

Worked one per session, except research, which runs alongside. Resolving one means writing the
answer here and appending one line to the map's **Decisions so far**;
[#497](https://github.com/saud-alnasser/rentable/issues/497) gists and links, and nothing here
is mirrored back onto it.

Decision 02 has moved to [[efforts/the-repository-becomes-a-monorepo/spec]] and keeps its
number there. It is **decided** — a minimal workspace, `apps/desktop/`, no `packages/` yet — so
decision 08 is no longer blocked.

**Two things reshaped these questions on 2026-08-17**, after most of them were written, and each
affected section says so at its head: local workspaces stay first-class, so every question below
answers for **two modes**; and the installed base is real, so *what happens to what already
exists* is a requirement rather than a footnote.

## 01 — research(persistence): what a libSQL embedded replica actually guarantees

Status: **resolved** — the finding at [[efforts/a-workspace-follows-its-user/evidence/research/libsql-embedded-replica-guarantees]],
verified 2026-08-13 against `@libsql/client` 0.17.4 and Turso Cloud's published documentation.
Part of: a-workspace-follows-its-user
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

- **Transactions survive (02, [[rules/multi-table-writes]]).** A batch stays atomic on every
  transport examined — synthesised client-side as `BEGIN`/conditional statements/conditional
  `COMMIT`/`ROLLBACK` in one pipelined request. But the mode argument becomes load-bearing where
  it is inert today, and in **opposite directions** on the two stacks: `@libsql/client`'s
  `batch()` defaults to `deferred`, which can fail on its read-to-write mode change against a
  replica; the new stack's `batch()` without a mode is **not transactional at all**. Interactive
  transactions exist and lock for writing with a 5-second timeout.
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
  which prices [[rules/list-reads]]'s unbounded reads directly — and sync bills 4 kB frames even
  for a one-byte row.
- **Read latency is a non-issue on a replica and write latency is the real cost (09).** Replica
  reads are local, documented as microseconds, and not network-bound. Commits carry a documented
  **ceiling of added latency by plan** — 100/50/25/10 ms — on top of the round trip, per commit.
  That prices reconcile's one-`UPDATE`-per-changed-row loops brutally against a remote, and it is
  the number the Drift section of the map is about. Turso publishes no response-size cap; the
  open-source server defaults are 10 MB per response and 32 MB total.

**What stayed open**, carried forward rather than closed by inference: what `offline: true`
actually guarantees, since Turso publishes nothing on it; whether `@tursodatabase/sync` can
target a libSQL rather than a tursodb database, which decides whether choosing offline writes
also means choosing the preview engine; how fast revocation propagates and what an already
connected or offline replica does when its token is invalidated; and client/schema version skew.

## 10 — grilling(persistence): which client, and whether offline-first survives

Status: **decided — option A, contingent on decision 11**
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 01 (resolved)

**Chosen: `@tursodatabase/sync`.** It is the only path that keeps the offline-first Constraint
whole without this repository writing its own convergence, and it is where the vendor is taking
the requirement. The choice is **contingent** rather than settled: decision 11 confirms it can
target a database this application can actually create, and confirms the fallback is real before
the fallback is needed. If 11 comes back against it, option B is the fallback.

**Option C is excluded as of 2026-08-17.** It was listed here as the trade of last resort, and
the trade was put to the human explicitly once local mode made it survivable — and refused.
Requirement 7 is hard in both modes. C therefore stops being a fallback and becomes an outcome
that ends the hosted architecture rather than shipping it; it stays written below because a
rejected option nobody recorded is re-proposed by the next person to read this.

**Question.** Given that a default embedded replica is read-only when disconnected, which of
these does this application become?

**A — `@tursodatabase/sync`, local-first with explicit push and pull.**
*Advantages:* the vendor's own recommendation for this requirement; reads and writes both local,
so the offline Constraint is kept whole and the transport seam gets a client that behaves like
today's local one; multi-device convergence is the product's job rather than this repository's.
*Disadvantages:* it is a different engine from libSQL, so nothing about it inherits SQLite's
track record; last-push-wins overwrites a losing writer's values silently, per statement rather
than per row-version, which is a worse story than today's whole-side conflict resolution and
lands squarely on [[rules/undo]]'s reasoning.
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

**C — Default embedded replica; offline reads only, no offline writes. — REJECTED 2026-08-17.**
*Advantages:* the simplest, best-documented, production-supported configuration; microsecond
local reads; no conflict model to design because there is only ever one writer path. It would
also have removed this spec's two largest risks outright — the pre-1.0 preview engine, and
last-push-wins silently overwriting a losing writer on a payments ledger.
*Disadvantages:* **it trades the Constraint.** An operator with no network can look up a tenant
and cannot record a payment — for a rents tracker that is close to the primary action.
*Risks:* the trade is discovered by users rather than by us if it is made implicitly.
*Maintenance impact:* the lowest of the four by a wide margin.
*Why it lost:* put to the human directly on 2026-08-17, at its strongest — after the two-mode
decision meant local mode would have carried offline writes on its own, so C no longer breached
the repository Constraint. Refused anyway. **A hosted workspace must accept offline writes**, and
the risks C would have removed are accepted knowingly rather than by omission.

**D — Local SQLite stays of record; the hosted database is a target this repository syncs to.**
*Advantages:* today's architecture is preserved exactly — every rule resting on a local file
stays true, and offline-first is untouched; it is the smallest change to what exists.
*Disadvantages:* sync becomes this repository's to write, and multi-device convergence with it;
that is the problem the other three options buy rather than build.
*Risks:* a hand-written sync layer is where correctness bugs live, and this repository already
has one whole-file sync mechanism whose fate is decision 07.
*Maintenance impact:* highest ongoing cost, and it is cost this repository carries rather than
the vendor.

## 11 — prototype(persistence): confirm the chosen client against a live database

Status: open — **this is the gate, and invoking it is the user's.** As of 2026-08-17 it is a
**go/no-go on the hosted architecture**, not a confirmation: requirement 7 is hard, option C is
rejected, so a prototype that finds no client can write offline against a hosted database ends
the hosted half of this effort rather than downgrading it. Local mode is unaffected either way.
Part of: a-workspace-follows-its-user
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
   and it decides how much of [[rules/undo]]'s reasoning survives. This is also acceptance
   criterion 9.
3. **What a genuinely offline first launch does** with `bootstrapIfEmpty` false — the documented
   path requires the remote reachable on first connect, which a fresh install on a disconnected
   machine does not have.
4. ~~**The two code-derived claims about the fallback**, so option B is known rather than assumed:
   whether `offline: true` still drops `syncInterval`, and what recovery from its conflict error
   actually looks like.~~ **Resolved 2026-08-17, with no account, exactly as the procedure
   intended.** Both claims re-read at the versions a fresh install now resolves to and recorded
   as §7 of [[efforts/a-workspace-follows-its-user/evidence/research/libsql-embedded-replica-guarantees]].
   **The gate is now four questions, not five.**

   Three findings, and the third is the one that matters:

   - **The version gap was real.** `@libsql/client` is still 0.17.4, but its `libsql: "^0.5.28"`
     now resolves to `libsql-js` **0.5.29**, which pins the Rust crate `libsql` **0.9.30**
     exactly. The earlier reading was taken at code an install no longer runs.
   - **`syncInterval` is still silently dropped** in the `offline: true` branch — and so is
     `encryption_config`, which the earlier reading missed. Two discarded options, neither
     erroring, against documentation that shows `syncInterval` and `offline` set together.
   - **A conflicting offline write has no recovery path at all.** `PushStatus::Conflict`
     returns `SyncError::InvalidPushFrameConflict` and stops; the one retry in that file is
     guarded on a different variant and explicitly excludes conflicts.

   **This makes option B a weaker fallback than decision 10 assumed.** Its failure mode is not
   "resolves badly" but "errors, handing the caller a frame-number mismatch with no
   library-provided way forward" — so falling back to it means this repository writes its own
   recovery, which is the work decision 10 chose option A specifically to avoid. It does not
   change decision 10, which already ranked B second; it raises the price of ever reaching for
   it, and that price is now known **before** the gate is tested rather than after.

   **"The pinned version" has no referent — corrected 2026-08-17.** `@libsql/client` is not a
   dependency of this repository and is not installed; it appears in `pnpm-lock.yaml` only as an
   unsatisfied peer range from drizzle-orm, because the application reaches SQLite through
   `drizzle-orm/sqlite-proxy` instead. Decision 01 verified against 0.17.4, which was the
   published version at the time rather than one this repository pins. **Choosing a version is
   part of this decision**, not a constraint on it.

   This item is also **the one part of decision 11 that needs no Turso account**: whether the
   builder drops `syncInterval` in the offline branch is answerable by reading the package source
   at a named version, which is research rather than prototype. It de-risks the fallback before
   the fallback is needed.
5. **What a reconcile pass costs over the wire.** The whole-table pass runs at every application
   start and both paths write one `UPDATE` per changed row, sequentially awaited. With a
   documented per-commit added-latency ceiling, this is the number that decides whether the
   architecture is usable before anything is built on it.

Throwaway code goes to `src/lib/prototype/` and is deleted ([[rules/prototyping]]); the
write-up is what is kept.

### What it needs to run

*Written 2026-08-17, so the run needs no further decisions once credentials exist.*

Two values in `.env`, which is gitignored (`.gitignore:15`) and is therefore where they belong.
They are **deliberately not added to `.env.example`**, because that file is tracked and
advertising configuration for an architecture this decision may reject would be premature.

| Key | What it is | Where from |
| --- | --- | --- |
| `TURSO_API_TOKEN` | a **Platform API** token, not a database token | `turso auth api-tokens create`, or the dashboard |
| `TURSO_ORG` | the organization slug the Platform API paths are built from | the dashboard |

The Platform API token is the one that matters: question 1 is whether the client can target *a
database this application can create*, so the prototype has to create one rather than be handed
one. Database auth tokens are minted from it during the run, which also exercises the
credential path decision 05 depends on.

### The procedure

1. ~~**Question 4 first, and it needs no account at all.**~~ **Done 2026-08-17.** It needed no
   account and it was taken first, exactly as intended: the fallback is now known before the
   gate is tested, so a negative result on questions 1–3 lands somewhere rather than nowhere.
   The answer is above and in §7 of the evidence. **Start at step 2.**
2. **Add `@tursodatabase/sync` and `@libsql/client` as devDependencies** for the duration. This
   touches tracked files, so `git status` shows them — which is the check that stops them being
   committed with the prototype. Both come out when the prototype is deleted.
3. **Question 1** — create a database through the Platform API, mint a token, and point
   `@tursodatabase/sync` at it. Record the URL scheme that worked (`turso://` or `libsql://`),
   because that is the answer that decides whether choosing offline writes also means choosing
   the preview engine.
4. **Question 3** — a first launch with `bootstrapIfEmpty` false and no network, before any
   successful connect. This is the fresh-install-on-a-disconnected-machine case.
5. **Question 2** — two client instances against one database, in separate directories, both
   disconnected, both editing one contract, both pushed. Record whether the loss is per
   statement, per row, or per field. This is acceptance criterion 9 and it decides how much of
   [[rules/undo]]'s reasoning survives.
6. **Question 5** — seed with `pnpm db:seed` for a realistic set, then run a whole-table
   reconcile against the remote and time it. Both reconcile paths write one `UPDATE` per changed
   row, sequentially awaited, against a documented per-commit added-latency ceiling — so this is
   a number, and the number decides whether the architecture is usable.

### What each outcome means

- **Question 1 negative** — decision 10 is a different decision than the one recorded, because
  the client and the engine stop being separable choices. Return to 10 before anything else.
- **Questions 2 or 3 unacceptable** — option A fails on its own terms and option B is tested
  next, with question 4's answer already in hand. **That answer is now in, and it is not
  encouraging** *(2026-08-17)*: option B's conflict path errors with no recovery, so testing it
  means testing whether this repository can write the recovery itself. Reaching this branch is
  therefore a return to [[skills/plan]], not a swap of one client for another.
- **Both A and B fail to write offline** — requirement 7 cannot be met, and **the hosted
  architecture does not ship**. That is the go/no-go. It is renegotiated with the human under
  [[policies/execution]], never relaxed quietly, and the local-mode half of this effort stands
  either way.
- **Question 5 returns an unusable number** — the architecture may survive with reconcile
  reshaped, which is a return to [[skills/plan]] rather than an end. Record the number; do not
  design the fix inside the prototype.

## 03 — grilling(persistence): what a user is, and where the control plane lives

Status: open
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11

**Question.** What a user record holds, and whether the control plane is built here or is a
hosted identity service. Also: what the request context becomes, given it carries no identity
today and every procedure in the application is written against a context that never needed one.

**How they authenticate is no longer part of this question. Directed 2026-08-17: sign in with
Google.** The OAuth 2 + PKCE flow, the refresh handling, the account shape carrying email and
display name, and the credential boundary that keeps tokens out of the web layer all exist in
`tauri/src/sync/google/auth.rs` and `RemoteSyncAccount`. 03 starts from reusing them and reports
what it costs, rather than weighing providers.

Bounded by *Out of Scope*: if the answer is a hosted identity service, no service is written
here at all.

**Reshaped 2026-08-17.** Two additions, both binding:

- **Identity is optional, not merely new.** A user with only local workspaces never signs in, so
  the context must carry no identity as an *ordinary* state rather than an error one. A design
  that makes identity required and then fakes an anonymous user for local workspaces has chosen
  the harder of the two failures.
- **This decision now owes the monorepo effort an answer.** Its accepted plan defers extracting
  the database schema into a package until a second consumer exists and names this decision as
  what produces one. So 03 states explicitly whether the control plane's schema is a second
  consumer of the domain schema or a separate description — that answer fires, or does not fire,
  the extraction's removal condition.

## 04 — grilling(persistence): how a permission bitfield is stored

Status: **decided 2026-08-17 — option A, one column capped at 53 and guarded by a test**
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: —

**The decision, so it is not read out of the table below.** A permission set is **one `INTEGER`
column**. Flags occupy bits 0–52 and **no flag may be defined at bit 53 or above**. The cap is
enforced by a test that fails when a 54th flag is added — the cap is not a comment, because a
comment does not fail a build. `permissions & mask` stays ordinary SQL.

**Removal condition**, so that "capped" is a state rather than an intention: **the column is
extracted to option D — a row per granted permission — the moment a 54th flag is wanted.** That
is a migration, not a rewrite, and reaching it is a signal that the bitfield model itself has
outgrown the storage rather than an emergency.

*Chosen 2026-08-17 by the human, from the options below, on the recommendation recorded there.*

**Question.** The proxy reads every `INTEGER` as an `i64` into a JSON number, which arrives in
JavaScript as a double — exact only to 2⁵³−1. A single 64-bit bitflag column therefore offers
53 usable bits before **silent** precision loss, and [[contexts/persistence]]'s promise that an
unmappable value fails the query does not cover it, because nothing fails: the value rounds on
the far side. Options include several integer columns, a text or blob representation, a row per
granted permission, or capping the flag set below the ceiling. This is answerable now and does
not wait on 11.

### What was assumed, and what was measured *(2026-08-17)*

The premise above was recorded from reading `tauri/src/database/proxy.rs:66` —
`"INTEGER" => Ok(Value::from(row.try_get::<i64, _>(index)?))`. It was **not** measured, and
[[contexts/persistence]] is explicit that value conversion is *per-transport*, so the two halves
could have disagreed. They were run against both.

| Stored | Memory transport (`better-sqlite3`) | Production wire (`JSON.parse` of Rust's i64) |
| --- | --- | --- |
| `9007199254740991` (2⁵³−1) | `9007199254740991` — exact | `9007199254740991` — exact |
| `9007199254740993` | `9007199254740992` | `9007199254740992` |
| `4611686018427387905` (2⁶²+1) | `9007199254740992`→`4611686018427388000` | `4611686018427388000` |
| `9223372036854775807` (i64 max) | `9223372036854776000` | `9223372036854776000` |

**Three findings, and the second was not in the premise:**

- **Neither transport throws.** `better-sqlite3` runs with default `safeIntegers` — the tree sets
  no other value, verified at `src/lib/platform/database/memory.ts` — and returns a lossy
  `number`. Rust's i64 is exact on the wire and degrades at `JSON.parse`. Two different routes,
  one identical silent result.
- **The two transports agree exactly**, which the premise did not establish and which matters:
  [[contexts/persistence]] warns that a router test can pass over a conversion broken in the
  running application. That warning does **not** apply here. A router test over the memory
  transport pins this faithfully, so whatever is chosen below is testable at the cheap tier.
- **The cliff is sharper than "53 usable bits" suggests.** A value using only bits 0–52 is
  exact. The moment bit 53 is set the value passes 2⁵³ and the **low-order** bits round away —
  so *the 54th flag defined silently corrupts the first flags defined*, retroactively, on every
  row already written. That is the worst available shape for a permission field: the failure
  lands on the oldest and most fundamental permissions, on read, with no error.

### The correction this forces to `contexts/persistence`

Its line 38 reads *"A value the conversion cannot map fails the query. Nothing degrades to null."*
That is **true as written and true of what it was written about** — the `other =>` arm of
`value_at` errors on an unknown storage class, which is the bug (#287) it was written from.
It is *read* as a wider guarantee than it makes: this value maps fine and then degrades
downstream, in JSON and in JavaScript, outside the conversion's reach. The promise is scoped to
storage classes rather than value ranges, and the context now says so.

### The options

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — one column, flags capped at 53, guarded by a test** | Cheapest. One `INTEGER` column; `permissions & mask` stays ordinary SQL; nothing about the schema changes when organizations arrive | The ceiling is a convention, not a type. 53 is invisible at the call site | The cliff stays silent unless the guard is written and kept. A guard that is deleted takes the protection with it | A test asserting the defined flag count ≤ 53, failing loudly on the 54th. One test, forever |
| **B — several integer columns** | Each column stays under the ceiling; bitwise SQL survives per column | Every check spans columns; "which column holds this flag" is a mapping to keep; a new column is a migration | The cliff moves rather than closing — each column still has 53 — and now there are several of them to know about | Worse than A at every point, for the same class of protection |
| **C — text or blob** | No ceiling; exact at any width. The proxy maps `TEXT` verbatim (`proxy.rs:68`), so no precision path exists | **Bitwise SQL is gone.** `WHERE permissions & 4` cannot be written against a string, so every check moves into application code over full rows | Pushes filtering to the client, which is the shape [[rules/list-reads]] reasons against | Parse and serialize on every read and write |
| **D — a row per granted permission** | No ceiling and no precision path at all. Checks are `EXISTS`, which SQLite does well; the schema documents the permission set instead of encoding it in a constant | More rows and a join. A role's whole set is an aggregate rather than a value | Lowest correctness risk of the four | Conventional relational maintenance; the most code, none of it clever |

**Recommendation: A.** Not because the ceiling is comfortable but because the real objection to A
is that its failure is *silent*, and silence is the cheap part to fix. A test that fails when the
54th flag is defined converts the whole risk into a red build, at a cost of one test — and a
realistic permission set for organization roles on a rents tracker is well under 53. B buys
nothing A does not, at more cost. C surrenders SQL-side checks, which is a real loss for a
question that is asked on every request. D is the correct answer if the flag count were genuinely
open-ended, and it is the one to take if you would rather not carry a convention at all — it is
strictly safer and strictly more work.

**What each costs when organizations arrive** *(acceptance criterion 15)*: A and B are values on
a membership row, so adding organizations adds rows, not shapes. C is the same. D adds a table
that membership joins to. **None of the four forecloses organizations**, and A→D is a migration
rather than a rewrite if the ceiling is ever approached — which is the removal condition, stated
so that "capped" is a state rather than an intention: **extract to D the moment a 54th flag is
wanted.**

**Is this a live defect today? No — checked, not assumed.** Every `INTEGER` column in
`src/lib/platform/database/schema.ts` is one of three things: a `primaryKey()` rowid, a foreign
key to one, or a `timestamp_ms`. Reaching 2⁵³−1 needs nine quadrillion rows, or a date past the
year 287396. **So no ticket is warranted against the current application** — this is a latent
hazard that decision 04 is about to walk into deliberately, not a bug shipping to users. It is
recorded here rather than in the tracker for exactly that reason ([[rules/tracker]]: work that
produces no branch is not a ticket).

**One note for decision 11, recorded here so it is not rediscovered.** Hrana encodes integers as
*strings* on the wire precisely to avoid this class of loss, so a hosted transport may well be
exact where both current transports are lossy. That does not change the recommendation — the
memory transport stays lossy either way, and the schema must be correct on the transport the
tests run over — but it means the hosted client is not a new source of this problem.

## 05 — grilling(api): where the domain runs once organizations arrive

Status: open
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11

**Question.** A client that writes to a local replica offline necessarily holds a credential
good for that whole workspace database for the length of the offline window. So a bitflag
permission model **cannot be enforced** against an offline client: the enforcement point would
have to be a server it is by definition not talking to, and removing a member cannot take
effect until they reconnect.

Three shapes, and one has to be chosen before organizations are designed: membership grants
full access and roles govern administration only; the domain moves behind the API for shared
workspaces and [[rules/api-layer]]'s no-repository-layer reasoning is reversed for them; or
shared workspaces simply do not get an offline replica. What this effort owes the answer is a
seam that makes it a change rather than a rewrite.

## 06 — grilling(persistence): who applies migrations to a hosted workspace

Status: open
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11

**Question.** Rust owns applying migrations today and the TypeScript side never runs them
against the app's database ([[contexts/persistence]]). With the database hosted and several
client versions able to connect, that ownership has to move somewhere — the API, the client on
connect, or a deploy step — and whichever it is has to answer what an older client does when it
meets a newer schema. That answer is requirement 11, and its check is acceptance criterion 12 —
which also holds this decision to leaving a local workspace's migrations exactly where they are.

## 07 — grilling(sync): what becomes of Google Drive sync

Status: open
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11

**Question.** A hosted remote of record makes Drive redundant as a sync mechanism while leaving
it plausible as a user-owned backup. Whether it survives, becomes an export path, or is retired
decides the fate of a large and carefully-built Rust surface — the manifest, conflict analysis,
retention, the link session — and of [[rules/drive-client-boundary]],
[[rules/drive-concurrency]], [[rules/drive-transport-testing]] and [[contexts/remote-sync]] with
it. Requirement 12 is that the answer is executed, not merely reached.

**Constrained again 2026-08-17, from the other side.** Sign-in is now Google, so **the OAuth half
of this surface is load-bearing for identity and survives whatever happens to sync.** `auth.rs`,
the token refresh, the account model and the credential boundary are no longer Drive's to retire.
What decision 07 may still retire is the *sync* surface — the manifest, conflict analysis,
retention, the link session — and it now has to separate the two, which nothing in the code
currently forces it to do. [[contexts/remote-sync]] treats them as one domain.

**Reshaped 2026-08-17, and this is the decision the two-mode choice constrains hardest.** Drive
is the *only* route a local workspace has off its machine. With local workspaces permanently
first-class, "retire it" is no longer one of three open options — retiring Drive would strand
every local workspace on one device, which is the problem this effort exists to solve, reimposed
on the users who did not opt into the new mode. So the real question narrows to: does Drive
stay as it is for local workspaces, or is it replaced by something else that serves them? A
hosted workspace almost certainly does not need it either way.

## 08 — grilling(platform): what a non-desktop client does for host capabilities

Status: **decided 2026-08-17 — the inventory below, and `Host` is inverted into a declared interface**
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — (was 02, now decided)

**The decision, so it is not read out of the prose below.** `Host` stops being
`typeof import('$lib/platform/tauri').tauri` and becomes a **declared interface that the Tauri
facade satisfies**. Nothing else changes: no browser client, no second implementation, no
capability added or removed, and every current call site keeps working because the facade still
satisfies the type.

**What this buys**, and it is the whole reason: a second client kind becomes an *implementation*
rather than a *rewrite*, which is what requirement 14 asks for and what acceptance criterion 15
checks. **What it costs when organizations arrive: nothing** — it is orthogonal to membership.

**What is still not decided:** what a browser client does for each *Ports differently* row in
the inventory. That is the browser client's design, and none is being built.

*Chosen 2026-08-17 by the human, on the recommendation recorded below.*

**Question.** `Host` is typed as the Tauri facade (`src/lib/api/context.ts:27`), so a browser
client has no host at all — export, diagnostics, settings and the updater all live behind it.
What the port looks like for a client that is not the desktop shell, and which capabilities
simply have no meaning there.

**Sharpened 2026-08-17.** Sign-in is now Google OAuth executed in Rust, so *authentication itself*
joins the list of things a browser client has no host for — and it is the one capability a
browser client cannot simply do without. This does not have to be solved here, but 08 now has to
say what the seam admits, because [[rules/drive-client-boundary]]'s "credentials belong in Rust
and there is no second place they could be" was written when no browser client was contemplated.

### The capability inventory *(worked 2026-08-17)*

Read off `src/lib/platform/tauri.ts` rather than recalled. Each group has one of **four** fates,
and the fourth is the finding:

| Capability | Fate off the desktop | Why |
| --- | --- | --- |
| `window` — show, hide, minimize, maximize, drag, close, restart | **No meaning** | The browser owns its chrome. `restart` is the only one with an analogue, and it is a reload |
| `opener.openUrl` | **Ports as-is** | `window.open` |
| `opener.revealItemInDir` | **No meaning** | No file manager to reveal into |
| `export.write` | **Ports differently** | Today it returns *where it landed*, and its own comment says "where an export may go is Rust's to decide, and the web layer has no say in it." A browser cannot answer that — the destination is the user's and is not reported back |
| `diagnostics.write` | **Ports differently** | Same call, different destination |
| `update` — prepare, check | **No meaning** | A browser client is always the deployed version. This capability does not port; it disappears |
| `settings` — get, set | **Ports differently** | The store moves off the Rust side |
| `backup` — list, create, delete, restore | **Ports differently, and only in local mode** | It is file-based. A hosted workspace's record of truth is not a local file, so this means something else there |
| `remoteSync` — getState, snapshotNow, autosaveNow | **No meaning in hosted mode** | Both snapshot calls need a local file that is of record. Decision 07 owns the Drive half |
| **authentication** | **Must be extracted before it can port** | — |

**The fourth fate has exactly one member, and it is the answer to this decision.**
Authentication is **not a capability of this port today.** There is no `auth` group; signing in
happens *inside* `remoteSync.googleDrive.link()`, as a step in linking a workspace to Drive. So
the one capability a browser client cannot do without is currently reachable only through the
one surface decision 07 may retire. **Decision 07's "separate identity from sync" and decision
08's "what the seam admits" are therefore the same edit, not two.** That is worth knowing before
either is worked.

### The structural finding, and what it costs to leave

`export type Host = typeof import('$lib/platform/tauri').tauri` (`src/lib/api/context.ts:27`).
The type is **read off the concrete facade**, deliberately — its comment says "a port over what
is already there, not a new abstraction," which was right when there was one client.

The consequence is precise: **there is no interface to implement.** A second client kind cannot
satisfy `Context` without shipping the Tauri facade itself, because `Host` *is* that facade's
type. Every capability above could be classified correctly and it would still be true.

So what this effort owes acceptance criterion 15 is not a browser client and not a port — it is
that `Host` stops being derived from one implementation. Two ways, and **this is a choice, not a
conclusion**:

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Invert it now** — declare `Host` as an interface, and have the Tauri facade satisfy it | The seam admits a second client the moment one is wanted. Cheap while the facade is the only implementer | Two things to keep in step where there is one today, for a client nobody is building | Low. A `satisfies` check fails loudly if they drift | One declaration, kept honest by the compiler |
| **Leave it derived, and record the condition** | No work now, no second artifact | The foreclosure stays real, and it is discovered by whoever first tries to add a client | The inversion gets harder as the facade grows — and it grows in this effort, since identity is being added to it | None until the day it is paid, all at once |

**Recommendation: invert it now**, and only that — no browser client, no second implementation,
no capability removed. It is the smallest possible change that turns "a second client is a
rewrite" into "a second client is an implementation", which is exactly what requirement 14 asks
for and what acceptance criterion 15 checks. **What it costs when organizations arrive: nothing
— it is orthogonal to membership.**

**What is deliberately not decided here:** what a browser client actually does for each
*Ports differently* row above. That is the browser client's design, and no browser client is
being built ([[policies/execution]] — the seam is in scope, the implementation is not).

## 09 — grilling(design): which accepted decisions survive

Status: open
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11, 05

**Question.** The premise every one of these was argued from is changing. Each is either still
true under a remote of record, or is superseded here with its reasoning stated afresh:

| Rule | What it rests on |
| --- | --- |
| [[rules/list-reads]] | whole result sets, argued from "there is no server" — and Turso bills rows *scanned* |
| [[rules/query-cache]] | `staleTime: Infinity`, argued from three enumerable writers and no unseen one |
| [[rules/undo]] | a session stack of inverses, argued from a workspace being one syncable unit resolved by choosing a side |
| [[rules/drive-concurrency]] | concurrency detected rather than prevented, argued from Drive offering no compare-and-set |
| [[rules/drive-client-boundary]] | credentials in Rust, which a browser client does not have |
| [[rules/api-layer]] | no repository layer — routers reach the database directly |
| [[rules/reconcile-scope]] | reconcile scoped by trigger, priced by decision 01 at one round trip per changed row |
| [[rules/database-client-type]] | one client type over two function types, which holds only if the chosen client can be driven through that seam — decision 11 is what tells us |
| [[contexts/repository]] | its first Boundary is **"There is no server"**, and it changes with them |

**This is bigger than it was when it was written.** The 2.x transition converted all thirty-four
ADRs into repository rules, each citing its origin — so what is being reviewed is live governance
that loads on the paths it names, not a folder of accepted records. A rule left standing after
its premise moved is worse than a stale ADR, because it is loaded and obeyed.

**Reshaped 2026-08-17, and mostly in a helpful direction.** With local workspaces permanently
first-class, the premise these rules rest on has not been *replaced* — it has been **narrowed**.
"There is no server" stays true of a local workspace and stops being true of a hosted one, so
the common answer is a scope rather than a supersession, and requirement 13 says so. That is
cheaper for most of the table. It is not cheaper for [[rules/query-cache]], whose reasoning is
that the writers are enumerable and there is no unseen one: a hosted workspace has an unseen
writer by construction — another device — and no scoping makes that go away.

One ADR had no citing rule until 2026-08-17: ADR 0001, *One database client type*, restored as
[[rules/database-client-type]] and now in the table above like the rest.

**This decision also carries the organizations gate, assigned 2026-08-17.** Acceptance criterion
15's promise — that nothing decided here forecloses organization workspaces — is checked here and
nowhere else. 09 produces a **written sketch of how an organization workspace would be added**,
re-reads every decision on this map against it, and reports what would have to be unpicked. The
criterion is met when the sketch exists and the answer is *nothing*. *Why it lives here: 09 is
already the decision that re-reads every other one against a changed premise, and a promise with
no owner is a promise that passes by default.*

Tickets #492, #493, #494 and #495 on [[efforts/work-the-surfaces-cannot-do/spec]] (#487) carry a
standing warning to be re-read against whatever this decision produces.

## 12 — grilling(persistence): how a local workspace becomes a hosted one

Status: open — **opened 2026-08-17**, when local workspaces became permanently first-class
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 11, 03

**Question.** Requirement 6 says a user may convert a local workspace to a hosted one, losing
nothing. Nothing in this effort had covered how, because until the two-mode decision there was
only a one-way migration nobody had scoped either.

What the answer has to settle:

- **What the conversion actually moves.** A local workspace is a SQLite file with a schema Rust
  migrated. A hosted workspace is a database created through a provider API with a schema
  something else migrated. Whether the conversion is a row-by-row copy through the client, a
  file upload the provider accepts, or a dump-and-replay decides how long it takes and what it
  can fail halfway through.
- **What happens to the local file afterwards.** Acceptance criterion 6 says it is not destroyed
  as part of the conversion — so it becomes a stale copy of a workspace that has moved, and
  something has to say what the application does when it finds one.
- **What happens to a Drive link the workspace already had.** Existing installs may be linked,
  and after conversion the workspace's record of truth is somewhere Drive knows nothing about.
  Leaving both running means two sync mechanisms writing one workspace, which is the shape
  [[rules/drive-concurrency]] exists to reason about and was never designed to survive.
- **Whether it is interruptible and what a half-finished conversion leaves behind.** It needs a
  network by definition, and the user running it is the one most likely to have a bad one.
- **What it costs to reverse**, which is the open question about one-way conversion. The answer
  here is what makes that question cheap or expensive to revisit later.
