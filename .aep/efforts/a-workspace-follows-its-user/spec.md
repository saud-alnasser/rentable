---
aep: 2.6.0
owner: repository
date: 2026-08-19
kind: spec
status: accepted
---

# Problem

A workspace is a file on one machine, and the application has never asked who is using it.

The database is local SQLite and it is of record. The only way a workspace reaches a second
machine is a Google Drive exchange of whole-file snapshots, resolved when the two sides
disagree by choosing a side ([[rules/credentials]], under *Concurrency*). The request context carries a
database, a clock and a host and nothing else (`src/lib/api/context.ts:36`); the schema has no
user table and no ownership column anywhere.

**The domain has never asked who. The application has.** That distinction was blurred until
2026-08-17, and it matters: `RemoteSyncAccount` already carries an `id`, `email`, `display_name`,
`avatar_url`, `provider_user_id`, `token_expires_at` and `refresh_token_available`, and
`tauri/src/sync/google/auth.rs` implements OAuth 2 with PKCE and refresh behind the credential
boundary [[rules/credentials]], under *Client boundary*, describes. So identity is **not** built from nothing —
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

~~**And this is not a greenfield application.**~~ **Struck 2026-08-18. There is no installed
base.** The human withdrew the assumption it rested on, and the release data corroborates it:
every running install polls `latest.json` on the newest release, and that asset on `v0.13.0`
has been fetched **twice, both times by this session**. Nothing has ever asked this application
for an update. The one release that looks like a population — `v0.10.1`, 39 installer
downloads — spreads them almost evenly across rpm, deb, AppImage, dmg, msi and exe with
exactly one download on every `.sig` file, which is a scraper's shape and not a user base's;
`v0.11.0` and `v0.11.1` have no installer downloads at all between them.

It is struck rather than deleted because it was load-bearing for a full day and shaped
requirement 1, acceptance criterion 1, the first Constraint and two Risks. A reader who finds
those in the history and not the reason they went should be able to see it here.

**So the problem is a greenfield one after all**, and every version prior to this effort's is
to be deleted rather than carried. What this changes is only *arrival*: no data has to survive
this change, so the effort keeps its architecture and loses its migration.

*The ordering clause is struck 2026-08-19.* It read: *"after acceptance criterion 1 has used the
last of them as its subject, not before"*, and it existed because that criterion manufactured a
populated pre-effort workspace to prove the identity migration on. **Criterion 1 no longer names
a release pair** — the identity migration landed at `4bc35646` and, with one record of truth,
runs against an empty database the control plane just created. So the deletion is unblocked and
depends on nothing.

**What did change on 2026-08-19 is the shape of the product**, which every prior amendment to
this section was careful to say it had not: there is no longer a local-of-record workspace. The
diagnosis above is untouched and is in fact sharpened — *the application is bound to a device
rather than to its user* was the first cost listed, and one record of truth is the direct answer
to it.

# Goal

A workspace follows its user: they sign in once and find it on whichever client they opened.
Every workspace is a database of its own — of record in Turso, replicated locally — and the
application stays fully usable with no network.

**One record of truth, and it is remote.** *Directed by the human 2026-08-19, reversing the
two-mode shape settled 2026-08-18.* There is no local-of-record workspace and no mode to
choose. Signing up with Google creates the account and its one personal workspace together, and
that workspace is a Turso database from the moment it exists. The replica on the machine serves
every read and takes every write, and it is not the record.

**What the reversal costs, said here rather than discovered in the requirements.** An account is
now required to use the application at all, and a first run needs a network, because signing up
is what brings the workspace into being. Offline-first survives everywhere except that one
moment — which is the trade, and it is accepted knowingly.

**What it buys** is the whole of the two-mode tax: no conversion, no adoption path, no rule that
has to be true twice, no discriminator with two live values to answer for, and no second
persistence story to test.

When this lands, a second client kind could be added, and organization workspaces with several
members and per-workspace permissions could be added, without reopening any decision made here.
**Neither is built.**

# Scope

*Rewritten 2026-08-19 for one record of truth. The 2026-08-18 note below is kept because its
lesson applied again: a section that survives a premise change untouched is usually the one
nobody re-read.*

- **One record of truth, and it is Turso.** Every workspace is a Turso database with a local
  replica. This is the decision that shapes every other item in this list, and it replaces *Two
  records of truth, both first-class* — which shaped the same list until 2026-08-19 and required
  each item to answer twice.

  *What the struck bullet said, kept so the reversal is legible: "A workspace is local-of-record
  or hosted-of-record, and the application supports both for as long as both exist. Each one
  below answers for two modes, not one."*
- ~~**The adoption path** — how a user converts a local workspace to a hosted one.~~ **Struck
  2026-08-19. There is nothing to convert.** Decision 12 answered it, and its answer is retained
  for a different reason: its row-by-row copier is the only safe way to put existing rows into a
  workspace database, because the sync engine rejects or truncates a file handed to it.

  *The 2026-08-18 note on this bullet is what caught the previous premise change late, and it is
  restated because it earned it: that respecify edited Problem, Goal, Requirements, Acceptance
  Criteria, Constraints, Assumptions, Risks, Architecture, Migration and Decisions, and left
  Scope alone.*
- **Identity, and it starts from Google.** A user record, how long a session lasts, and what the
  request context carries as a result. **How they authenticate is directed as of 2026-08-17:
  sign in with Google**, reusing the OAuth 2 + PKCE flow, refresh handling and account shape that
  already exist in Rust. Decision 03 works out what that means for the user record and the
  control plane; it does not reopen the choice of provider.

  *One clause of this bullet is struck 2026-08-19: "including what it carries when there is no
  user because the workspace is local." There is no such case. Identity is present on every
  request, which is a simplification decision 03 and the built `Context` should both be re-read
  against.*
- **The control plane, and it is built here.** Accounts, workspaces and the association between
  them: one always-online multi-tenant database behind **an API this repository designs**, which
  also creates each workspace database and mints the token a client syncs with. *Directed by the
  human 2026-08-18.* Designed here, deployed elsewhere — see *Out of Scope*.
- **Where the data path runs, and where it does not.** Clients sync **directly** with their
  workspace database; the API is in the credential path continuously and in the data path never.
  It is the property three requirements rest on, and *Architecture* has the reasoning.
- **Domain logic stays on the client.** *Stated 2026-08-19, because one record of truth invites
  the opposite reading.* Moving the database to Turso moves where rows live, not where rules run:
  routers, reconciliation and every derived status keep running locally against the replica. The
  control plane holds accounts and workspace association and knows nothing of contracts.
- **Workspace persistence, and the engine moves layers.** A Turso database of record with a local
  replica, reached through the transport seam that already exists — `createDatabase(single,
  batch)` at `src/lib/platform/database/client.ts:47` takes two function types, and a workspace is
  a caller at that seam. **The sync engine runs in Rust behind the existing `db_execute_*`
  commands** *(directed by the human 2026-08-19)*, not in the web layer: the npm client is a
  native NAPI addon and the frontend is `adapter-static` inside a WebView2 with no Node.
  Decisions 10 and 11 carry it.
- **What a workspace replicates, and `history` is the question that forces it**
  *(added 2026-08-18)*. #532 landed a durable `history` table, so the workspace holds a record of
  what was done to it as well as the records themselves. **It replicates** — a user who opens
  their workspace on a second machine and finds no account of what they did on the first has been
  handed half a workspace, and requirement 4 says the workspace follows them.

  **The consequence is not free and belongs here rather than in a footnote.** History is the
  first table in this schema whose rows are only ever inserted and never updated, which is the
  worst shape under last-push-wins: two devices' histories do not merge into one longer history,
  one replaces the other, and what is lost is the very record that would have said so. It is the
  same finding as *Risks*' identity collision seen from the other side, and decision 11's
  question 2b covers both.
- ~~**The workspace discriminator.**~~ **Struck 2026-08-19.** `provider` was `local |
  googleDrive` and was to gain a third value. With one record of truth there is nothing to
  discriminate: what remains is retiring the enum and the nine sites that branch on it, which is
  deletion rather than a new value. *Components* carries the count.
- **Migrations against a workspace database.** Who applies them, and what a client older than the
  schema it meets does about it. Decision 06 answers both, and its *"a local workspace's
  migrations stay Rust's"* clause is now moot — see requirement 11.
- **Google Drive sync's fate.** **Decided 2026-08-18: it retires in favour of Turso sync**,
  directed by the human. *Simplified 2026-08-19:* the clause that made this expensive was "and
  whatever it becomes still serves local workspaces." There are no local workspaces, so
  retirement is now unqualified deletion of the Rust sync surface and its user surfaces, with no
  replacement owed. What #536's whole-workspace export and import remains is a user-facing
  exchange format, which is what it always was.
- **The rules resting on "there is no server."** Which survive the premise change and which are
  superseded with their reasoning written afresh, and the first Boundary of
  [[contexts/repository]] with them. *Amended 2026-08-19: "scoped to local workspaces" is no
  longer one of the three available answers, which makes this stricter rather than easier — a
  rule that was going to be narrowed now has to be superseded or defended.*
- **The backup surface retires.** *Added 2026-08-19, directed by the human: "there are no longer
  a backup; backup is turso in the cloude."* Turso holds the record and carries its own
  point-in-time restore, so the application stops keeping snapshot files. This is deletion —
  `tauri/src/backup/` is 1,899 lines across four modules, with a manifest, a protected-snapshot
  concept the updater uses, `startup-recovery.svelte`, the settings surface and i18n strings in
  both `ar` and `en`. Requirement 17 states what has to be true before it goes.

# Requirements

1. **An update never asks for a re-login, a manual step, or anything else of the user in order to
   reopen the workspace they already had.** After a new version arrives through the updater, the
   application opens the same workspace, with the same data, and needs nothing from the user.

   *Rewritten twice. It read "An existing local workspace survives the update untouched" and
   existed to protect an installed base that turns out to be empty; it was rewritten 2026-08-18 to
   promise no account and no network. **2026-08-19 removes "an account" and "a network" from the
   promise**, because one record of truth makes both preconditions of running the application at
   all rather than costs the updater imposes. What survives is the part that is still the
   updater's to keep: a version change must not invalidate a session, and must not put a user who
   was working behind a login page.*
2. **An installation holds exactly one workspace, and it is a Turso database with a local
   replica.** There is no second workspace, no switcher, and no mode. Converting is not something
   a user can do, because there is nothing to convert from.

   *Rewritten 2026-08-19. It read: "An installation holds exactly one workspace, and that
   workspace has a mode. It is local-of-record or hosted-of-record, both are first-class, and a
   user may keep it local indefinitely without an account."*
3. **An account is required, and authenticating establishes who the acting user is.** Signing up
   with Google creates the account and its one personal workspace in the same act; the
   application has no usable state before that and does not pretend to.

   *Rewritten 2026-08-19. It read: "An account is required for a hosted workspace and for nothing
   else — a local-only user never creates one, and the application knows of no user at all in
   that case." That population no longer exists.*
4. A user's workspace is reachable from any device that user signs in on, with no file copied and
   no per-device link step.
5. A workspace is one database, of record in Turso, with a local replica that serves reads.
6. **An account owns exactly one workspace, and it is created for them at sign-up.** *Rewritten
   2026-08-19; it read "A user may convert a local workspace to a hosted one, deliberately, losing
   nothing."* Several workspaces per account, workspaces with several members, and per-workspace
   permissions are the organization work named in requirement 14, and are not built here.
7. **After the first sign-in, the application remains fully usable with no network — reads and
   writes — for as long as the session's refresh window is open.** **This is hard, and confirmed
   as hard on 2026-08-17.** A workspace that cannot record a payment without signal does not
   satisfy this effort, and shipping one is not an available outcome. The consequence is written
   into decision 11: if the chosen client cannot deliver offline writes, **this architecture does
   not ship** and the effort stops rather than degrading.

   *Amended 2026-08-19 at both ends. The phrase "in both modes" is gone. So is the unbounded
   reading of "with no network": requirement 15 closes the window at three days, and past it the
   application locks behind a login page — so this is now explicitly scoped to the open window
   rather than to all time, and requirement 15 is where that boundary is argued.*
8. Divergence between two devices on one workspace resolves without silent, unreportable loss.
9. The database client type does not fork. A workspace's transport is a caller at the existing
   seam, not a second persistence layer.
10. The request context carries identity on every request, and every procedure needing the acting
    user takes it from there rather than from an argument a caller supplies.

    *Rewritten 2026-08-19. It read: "carries identity when the workspace is hosted … A local
    workspace's requests carry none, and no procedure breaks for want of one." **This is a
    simplification with a built consequence**: #547 shipped `identity` as an optional member
    precisely because the local case had to be absent. Whether it becomes required is a real
    change to `Context` and to `context.test.ts`, and it is named here rather than assumed.*
11. **A workspace's schema has one named owner who applies migrations, and a client meeting a
    schema it does not understand refuses in a way the user can act on.**

    *Amended 2026-08-19; the sentence "A local workspace's migrations stay Rust's, as they are
    today" is struck.* **Rust applies no migrations at all** — directed by the human 2026-08-19.
    The control plane owns the workspace schema and applies it at the token mint (decision 06);
    the replica receives that schema as replicated pages. `tauri/migrations/` survives only as the
    input `build.rs` counts to produce `WORKSPACE_SCHEMA_VERSION`, which is what the client sends
    to the mint.
12. **Google Drive's fate is decided and executed** — the surface is not left running with no
    stated purpose.

    **Decided 2026-08-18: it retires, in favour of Turso sync** *(decision 07, directed by the
    human)*. *Simplified 2026-08-19: the clause "and whatever it becomes still serves local
    workspaces" is struck with the mode it served.* Retirement is now unqualified — the Rust sync
    surface and its user surfaces are deleted, and nothing is owed in their place.
13. Every rule and boundary resting on "there is no server" is restated as still true, or
    superseded with its reasoning written afresh. *Amended 2026-08-19: "scoped explicitly to local
    workspaces" was the third available answer and is withdrawn.*
14. Organization workspaces — several members on one workspace, and permissions per workspace —
    are not built, and nothing built here forecloses them. *Confirmed by the human 2026-08-19 as
    the next body of work rather than as a hypothetical.*
15. **A session has two windows, and the client believes the earlier.** *Directed by the human
    2026-08-19, replacing the single sliding window directed 2026-08-18.*

    - **Three days is the refresh window.** A signed-in client works offline for three days;
      reaching the API at any point inside the window refreshes the credential and the window
      restarts from there. Past three days with no contact the application **locks behind the
      login page until a network is available** — and when one is, the refresh happens without the
      user typing anything, provided the second window is still open.
    - **One month is the absolute lifetime.** It is set when the user signs in, it is **never
      moved by a refresh**, and past it a real Google re-login is required however faithfully the
      client has been reaching the API.

    **The second window does not exist yet.** `apps/control-plane/src/session/session.ts`
    implements the three-day window as purely sliding, with nothing capping the renewals, so a
    user who opens the application daily stays signed in forever. `tauri/src/sync/control.rs`
    already carries two moments and believes the earlier, but they are *session* and *replica
    credential* rather than *refresh* and *absolute*.
16. **A record's identity is assigned so that two replicas cannot produce the same one.**
    *Directed 2026-08-18.*

    **Built and landed 2026-08-18 at `4bc35646`** — `0003_serious_synch.sql` builds an `idmap`,
    rewrites all six tables to `TEXT` UUIDv7 keys, and drops `idmap`. *Amended 2026-08-19:* the
    clause "one scheme covers both modes" is moot with one mode, and the reasoning that made this
    "the largest single piece of work on this effort" is spent — it is done. On a freshly created
    workspace database the migration finds empty tables and simply produces the right schema.

    **Collapsing `0000`–`0003` into one migration is now available and is not required.** It was
    unavailable while acceptance criterion 1 named a release pair that had applied all three; with
    no installed base and no local-of-record workspace, nothing carries integer keys forward. It
    is tidying, it would move `WORKSPACE_SCHEMA_VERSION` from 4 to 1, and it would touch #557's
    tests.
17. **The backup surface is removed, and what depended on it has an answer first.** *Added
    2026-08-19, directed by the human: Turso in the cloud is the backup.* Two things depend on it
    today and neither may be deleted silently: the updater takes a protected snapshot before
    installing, and `startup-recovery.svelte` offers a route back from a workspace that will not
    open. Each is either shown to be unnecessary under a remote record of truth, or replaced.
18. **Declining to renew is invokable on a running control plane, per account.** *Added
    2026-08-19 from a review of #550 (#564), and not yet accepted — this file's `status` covers
    the seventeen above it.*

    *Architecture* rests on this and the vendor gives no help: Turso's own revocation is
    bulk-only, rotates every token in its group, and has no published propagation time (decision
    01), which cannot remove one member of one workspace. **Declining to renew is what this
    repository offers instead.** `declineRenewal` exists in
    `apps/control-plane/src/session/session.ts`, is tested, and is reachable from **no route, no
    command and no timer** — so on a deployed control plane there is no way to perform it. **An
    answer nobody can call is not an answer**, and the requirement is that it becomes callable,
    not that it becomes a product.

    **What it buys is bounded, and the bound is already accepted rather than a shortfall.** A
    Turso token already minted is the vendor's to honour for its three days, so declining takes
    effect within one token lifetime — the bound *Architecture* names, and the reason the window
    is three days rather than thirty. A requirement promising immediacy would be promising
    something this shape cannot deliver.

    **Who decides to remove somebody, and through what interface, is not this.** Requirement 14's
    organization work owns that surface.
19. **The control plane's own database does not grow without bound.** *Added 2026-08-19 (#564),
    and not yet accepted.*

    A `session` row is written on every sign-in and on **every request that presents a Google
    access token** — `asking` in `server/server.ts` starts one whenever the credential is not
    already a session. Nothing removes a row. `forgetExpiredSessions` exists, keys on the
    absolute lifetime rather than the refresh window — the only correct key, since a session
    three days past its last reach is still refreshable — and is reachable from a test and from
    nowhere else.

    **An expired row is inert, so this is accrual and not a correctness failure**: `resumeSession`
    does not match one. That is why the requirement is about growth rather than behaviour. A table
    nobody prunes is a bill and an incident nobody has scheduled, on the one database here that is
    single, always online, and has no replica to lose.

    *Found while specifying this, and it is drift rather than a second defect:*
    `apps/control-plane/README.md` says a session is issued by "the two routes that hand one back
    and not by the others, which would otherwise write a row per request". **Both halves are false
    now.** Every route hands a session back — #557's mint returns one too — and none of them
    decline to issue, so a row per request is exactly what happens. `server/server.ts:98` links
    `askingForASession` to explain the behaviour, and **that function was never written**. Nothing
    is broken by it — the rows go to the client rather than being orphaned — but the file that
    says how many are written is wrong, and it is the file somebody would size this against.

# Acceptance Criteria

*Rewritten 2026-08-19 for one record of truth. Six criteria existed to check a mode that no
longer exists, and a criterion that checks nothing reads at review exactly like one that passes —
the defect this section has now caught five times. What each struck criterion said is kept beside
its replacement.*

1. **A signed-in installation updated through the real updater reopens the same workspace, with
   the same data, and never shows a login page.** *(requirement 1)* No CI run substitutes for it:
   it needs a real installed build, a real session, and a real update.

   *Rewritten 2026-08-19, and it is much smaller than it was.* It read: *"Install the previous
   release, populate it, and update to the current one through the real updater: the same
   workspace opens, with the same data, and nothing asks for a sign-in"* — and it carried five
   sub-checks on the identity migration, because it was the only thing standing between a
   populated pre-effort workspace and a botched remap.

   **All five are struck, and the reason is that the thing they guarded is gone twice over.**
   `0003_serious_synch.sql` landed at `4bc35646`, and with one record of truth every workspace
   database is created empty by the control plane and has the migration applied to nothing. There
   is no populated pre-effort workspace, there is no local file to carry forward, and a per-concept
   count comparison across an update compares a replica to itself. **What replaces them is
   criterion 6**, which checks the schema the migration actually produces, on the database it
   actually runs against.

   *Kept from the struck version, because it is still true and still owed:* the interruption
   guarantee is a property of how a migration is written, not one it inherits —
   `apply_migration` commits a file's statements and its `__migrations__` row in one transaction,
   so a migration split across two files loses it silently. That constraint now belongs to the
   control plane's runner rather than to Rust's, and requirement 11 is why.

   *And kept as a record of what the 2026-08-18 rehearsal bought:* a `v0.12.0` install populated
   with 5,000 tenants, 10 complexes, 95 units, 1,177 contracts, 1,729 assignments and 709 payments
   was updated in place to `v0.13.0`; migration `0002` applied, every count identical, all five
   references resolving at zero dangling. It verified the updater end to end — the endpoint, the
   version comparison, the artifact choice and the install — and **it did not verify the plugin's
   own check-download-relaunch**, which this criterion still needs and which is cheap to close.
2. **The application opens exactly one workspace, and there is nothing to choose.**
   `RemoteSyncState.workspace` stays singular; a search of the tree finds no workspace list, no
   switcher, and **no mode discriminator** — the `provider` enum and every site branching on it
   are gone.

   *Rewritten 2026-08-19. It read: "The workspace's mode is visible to the user and choosable by
   them — neither mode is reached only by editing configuration." There is no mode to show, and
   the half of it worth keeping — no list, no switcher — is kept above and strengthened.*
3. **There is no route into a usable workspace without signing in.** A clean install presents
   sign-in and nothing else; no surface renders workspace data, and no write is accepted, before
   an account exists.

   *Rewritten 2026-08-19. It read: "Creating a hosted workspace requires an account; creating or
   opening a local one never prompts for sign-in at any point." The second clause described the
   population this effort no longer has, and the criterion now checks the opposite property.*
4. On a clean install, signing in with valid credentials reaches that user's workspace; invalid
   credentials do not, and the refusal says what to do. Signing out and back in on the same
   machine restores the same workspace.
5. A workspace created on machine A is present, with its data, on machine B after signing in as
   the same user — no snapshot exported, no folder linked.
6. **Signing up creates exactly one workspace, and the schema it is created with is the one the
   client expects.** *(requirements 3, 6, 11 — new 2026-08-19, replacing the conversion
   criterion.)* After a first sign-up: one workspace database exists for that account, every table
   the schema declares is present, **every primary and foreign key is `TEXT`**, and no `idmap`
   table survives. The client's `WORKSPACE_SCHEMA_VERSION` equals the version the control plane
   recorded against the workspace.

   *What this replaces:* **"Converting the workspace from local to hosted moves every record, and
   a row-count and spot-value comparison before and after matches. The old local file is left on
   disk as a safety copy, not as a second workspace."** There is nothing to convert. Decision 12's
   copier survives for a different reason — see that decision.
7. With the network disconnected, every list and record surface renders its data from the local
   replica.
8. With the network disconnected, recording a payment succeeds; after both devices reconnect the
   payment is present on the second.
9. Where the chosen client resolves divergence by overwriting, a test demonstrates **exactly what
   a losing writer loses** — per statement, per row, per field, or **per record identity** — and
   that answer is written into this spec rather than discovered later. The test covers **two
   devices creating unrelated records**, not only two editing one — the second is the contended
   case and the first is the guaranteed one.

   **Half of this is answered and the criterion did not say so** *(2026-08-18)*. Decision 11
   measured it live: the contended loss is **per column**, not per statement, row or field, and a
   row deleted under a concurrent edit is taken whole with no error on either side. The
   uncontended case is the identity collision, and requirement 16 closes it. So *"that answer is
   written into this spec"* **is satisfied** — it is in decision 11 and in decision 09's preamble.
   What is **not** satisfied is *"a test demonstrates"*: the demonstration was a prototype, and
   [[rules/module-layout]] had it deleted. **A criterion met by a deleted prototype is not met**,
   so what remains here is a kept test, and the finding it must reproduce is now known in advance
   rather than being what the test discovers.

   *Amended 2026-08-19: the measurements behind "half is answered" were taken through the npm
   NAPI binding. The engine moves to the Rust crate at the same version, so they are expected to
   carry — but the kept test this criterion demands is now a Rust test, and it is the thing that
   turns that expectation into an observation.*
10. `createDatabase` still returns one client type. Production and test transports both satisfy
    it, and a search of the tree finds no second database client type.
11. **Identity is present on every request**, every procedure needing the acting user reads it
    from the context, and `src/lib/api/tests/context.test.ts` covers it.

    *Rewritten 2026-08-19. It read: "…covers a request carrying identity and one carrying none —
    the second being an ordinary local-workspace request rather than an error case." That second
    case is gone, and **the criterion now has teeth it did not have**: #547 shipped `identity` as
    optional precisely to allow the absent case, so satisfying this means changing `Context` and
    the test that was written around the old shape.*
12. **Applying a migration to a workspace database is a documented path that has been exercised
    end to end**, and a client older than the workspace schema shows a message naming the action
    to take and issues no write.

    *Rewritten 2026-08-19.* Its second half read: *"A local workspace's migrations are applied by
    Rust exactly as now, demonstrated by a Rust migration harness, which does not exist yet and is
    part of this work."* **That harness is no longer owed** — requirement 11 moved migration
    ownership entirely to the control plane, so what this criterion checks in the client is the
    opposite: **a search of the tree finds no migration runner on the client's startup path**, and
    `tauri/migrations/` is read only by `build.rs`.

    *The 2026-08-18 correction that produced the harness clause is kept, because its lesson
    outlives its subject:* `database/migrations.rs` and `database/mod.rs` contained no tests at
    all, and this criterion had read since it was written as though its local half were covered by
    something that never existed — the one shape of defect this spec has now caught five times.
13. **Google Drive is gone from the tree, and a workspace reaches a second machine through
    Turso** — demonstrated end to end on two installations.

    *Rewritten 2026-08-19, and it collapses from two demonstrations to one.* The 2026-08-18
    version required two, because the two modes no longer shared a route: an export-and-import
    round trip for a local workspace, and Turso for a hosted one. With one record of truth there
    is one route, and **what it loses is named: per column**, per decision 11's live measurement.

    **What is struck with the mode, and it was the larger number:** *"everything since the last
    export"* — the price a local workspace paid for Drive's retirement. It is no longer paid by
    anybody, which is the one place this reversal makes a user strictly better off.

    #536's whole-workspace export and import stays in the tree as a user-facing exchange format.
    It is not a sync route and this criterion does not accept it as one.

    *Rewritten three times. 2026-08-17: the original ("can still reach its remote by whatever
    route the decision leaves it") passed whatever decision 07 decided, which is not a criterion.
    2026-08-18: the replacement had gone stale within the day — #536 landed a whole-workspace
    export and import, so "data reaches a second machine and comes back" became true of this
    application with Drive deleted and no decision taken at all. **A criterion that a broken
    version passes is the defect this one keeps acquiring**, which is why the route is named and
    the loss is part of what is shown.*
14. Each affected rule file either states that it still holds, or is superseded in place. A search
    for "there is no server" returns only text that is still true when it is read.

    *Amended 2026-08-19: "states the mode it is now scoped to" was the middle option and is
    withdrawn with the mode. This is stricter — a rule that could have been narrowed must now be
    defended or superseded.*
15. Each decision below records, in writing, what adding organization workspaces would cost
    against the choice it made. **The promise that none of them forecloses organizations is
    checked by decision 09 and nowhere else**: that grill produces a written sketch of how an
    organization workspace would be added, re-reads every decision on this map against it, and the
    criterion is met when the sketch exists and names nothing that would have to be unpicked.

    *Amended 2026-08-19: the human confirmed organizations, several members per workspace and
    per-workspace permissions as the next body of work rather than as a hypothetical, which raises
    what this criterion is worth without changing what it asks.*
16. **Both session windows are demonstrated, and the client believes the earlier.**
    *(requirement 15, rewritten 2026-08-19.)* Tested by moving the clock rather than by waiting:

    - **The refresh window.** Sign in, disconnect, advance past three days: the application locks
      behind the login page. Repeat with one successful reach inside the window and it does not.
      **Reconnecting inside the absolute lifetime lifts the lock with no typing** — the refresh is
      silent, and a run that makes the user sign in again fails this criterion.
    - **The absolute lifetime.** Sign in, reach the API every day, advance past one month: a real
      Google re-login is required. A window that slides past a month fails.
    - **No write made during either window is discarded to produce the lock.** An expiry that eats
      unsynced work fails this criterion.

    *What is struck: "A local workspace run through the same test never asks for anything."*
17. **Two clients, each disconnected, each creating records the other has never seen, produce
    records that are all present and all distinct after both sync.** *(requirement 16)* Counted,
    not spot-checked: the number of records afterwards equals the number created. Run for every
    concept the schema carries, `history` included, since it is the table whose rows are only
    inserted. **The pre-migration behaviour is captured as a failing test first** — the collision
    is demonstrated before it is fixed, so the fix is shown to be what closed it.
18. **The backup surface is gone, and nothing that depended on it fails silently.**
    *(requirement 17 — new 2026-08-19.)* A search of the tree finds no `tauri/src/backup/`, no
    backup manifest, and no backup surface in settings or i18n. The updater still protects a user
    mid-update by whatever mechanism replaces the protected snapshot, and that mechanism is named
    and exercised; `startup-recovery.svelte`'s job is either shown to be impossible under a remote
    record of truth or is done by something else. **Deleting either without an answer fails this
    criterion**, which is the whole reason it exists.
19. **Declining renewal for one account is performed against a running control plane, by
    whoever operates it, with no code change and no hand-written `delete`.** *(requirement 18 —
    new 2026-08-19.)* Performed for one named account: that account's sessions end and no other
    account's do; the invocation answers how many ended, so *nobody was signed in* is
    distinguishable from *somebody was and is not now*; a client holding one of those sessions is
    refused at its next reach with `session_expired` and mints no further workspace token.
    **The account is named by something an operator actually holds** — an invocation that takes
    only an internal id, when what an operator has is an email address, is one they will get
    wrong.

    *An invocation demonstrated only by a test fails this criterion*, and that is the whole reason
    it exists: #550's mechanism was tested, and being tested is precisely the state being
    corrected.
20. **Pruning is invokable, and it removes what is dead and nothing else.** *(requirement 19 —
    new 2026-08-19.)* Run against a database holding all three: a session past its absolute
    lifetime is gone; a session **three days past its last reach but inside its month** survives,
    because requirement 15 promises it is still refreshable and removing it would fail criterion
    16; a live session survives. The invocation answers how many it removed. Tested by moving the
    clock rather than by waiting.

# Constraints

- **No install may be forced to lose data.** An update reaches a machine through an updater, not
  through a decision its user made about architecture, so a version that requires a manual step
  in order to reopen data the user already had is a data-loss event with a friendly name.

  *Amended twice. It opened "No existing install may break" and justified itself with five
  shipped releases holding real people's rent records; **neither half survived** 2026-08-18 —
  there are no existing installs and no real records on them. It was kept because it is about
  what an updater owes anyone it ever reaches. **2026-08-19 removes "an account" and "a network"
  from the list of things a version may not require**, because one record of truth makes both
  preconditions of running the application at all. What remains is the manual step, and the
  session: an update must not put a working user behind a login page.*

  *What this stopped doing on 2026-08-18 was carrying the local mode. **What it stopped
  protecting on 2026-08-19 is the mode itself** — see the struck Constraint below.*
- ~~**Two modes are a permanent shape, not a transition period.**~~ **Struck 2026-08-19,
  directed by the human. This Constraint has been reversed, not outgrown, and it is written out
  in full because a Constraint that simply vanished would read as an oversight.**

  *What it said:* "Why: it would be cheap to treat local-of-record as a compatibility shim to be
  removed in a later release, and that is a different product than the one chosen here. A
  decision that only works if local is temporary is the wrong decision."

  **It was right about the risk and wrong about which product was wanted.** Local-of-record was
  not treated as a shim and then quietly dropped; it was put to the human on 2026-08-18 at its
  strongest, kept on its own merits, and then removed on 2026-08-19 as a deliberate product
  choice — *"everything is turso; apps have local replica."* The distinction matters because the
  failure this Constraint existed to prevent is the one where nobody ever decides.
- **Offline-first, for as long as the session's refresh window is open.** The application is
  fully usable with no network. *Why: it is a repository Constraint ([[contexts/repository]]),
  and recording a payment is close to the primary action — an operator standing in a building
  with no signal who cannot record one has lost the product.*

  **The trade was offered and refused, 2026-08-17**, and the refusal still governs: offline
  writes are required, and the cheapest, best-documented client configuration available is still
  the one that erodes them. There is no version of this Constraint that gets traded — only one
  that gets met or stops the work.

  **What 2026-08-19 changes is its edges, in two directions, and both are new exposure.** It used
  to be unbounded in time and satisfied by local mode in the worst case. Now it starts *after* a
  first sign-in, which needs a network, and it ends at three days, after which the application
  locks behind a login page. **The Constraint is genuinely weaker than it was**, requirement 15
  is where the boundary is argued, and it is recorded here rather than left to be discovered by
  the first user who travels.
- **One database client type.** *Why: production and test clients are the same
  `SqliteRemoteDatabase<typeof schema>` and run the same row mapping, which is what lets a router
  test exercise the real boundary. A decision that forks the client type is answering the wrong
  question.* Recorded originally as ADR 0001, and **now a live rule again**:
  [[rules/api-layer]], under *One database client type*, restored 2026-08-17.
- **Arabic and English, RTL and LTR, both first-class.** Sign-in, account and error surfaces are
  new surfaces and inherit this.
- **Never `add --overwrite` or `init --reinstall`** on design primitives.
- **Organization workspaces are designed for and not built.** *Why: a decision that makes them
  unreachable is the wrong decision even where it is the simplest one, and this effort is where
  they become reachable or do not.* **Reinforced 2026-08-19**: the human named organizations,
  several members per workspace and per-workspace permissions as the next body of work.
- **The transport seam is where the change lands.** *Why: a workspace database is a caller at a
  seam that already exists; a decision that introduces a new persistence layer instead has
  mistaken the size of the change.* *Amended 2026-08-19: the seam holds, and what moved is which
  side of the Tauri boundary the engine sits on — see decision 10.*
- **Maintenance is invoked, never scheduled here.** *Added 2026-08-19 (#564).* *Why: nothing is
  deployed and deployment is out of scope, so a timer would be a schedule with nowhere to run and
  a second thing to be wrong about.* `pnpm --filter ./apps/control-plane sweep` is the precedent
  this effort already set — a command a person runs on a day they picked — and **a second
  mechanism for the same job is one too many**. What shape the invocation takes is
  [[modes/plan]]'s and is not settled here.
- **An operation that removes rows answers how many it removed.** *Added 2026-08-19 (#564).*
  *Why: both mechanisms already do, and it is not decoration — it is what tells "nobody was signed
  in" from "somebody was and is not now". An operator who cannot tell those apart has run a
  command and learned nothing.*

# Out of Scope

- **The repository restructure.** [[efforts/the-repository-becomes-a-monorepo/spec]] owns it, and
  this effort **depends on it**. That effort is now `accepted` and its layout is known:
  `apps/desktop/` holds the application, the root is private and unversioned. Its plan defers
  extracting the database schema into a package until a second consumer exists, and **names
  decision 03 of this effort as the thing that produces one** — so decision 03 owes an explicit
  answer to whether the control plane's schema is a second consumer of the domain schema or a
  separate description. *(Since satisfied in one direction by #557, which extracted
  `packages/workspace-migrations`.)*
- ~~**Retiring local workspaces, ever. Not deferred — excluded.**~~ **Struck 2026-08-19. This is
  the exclusion the effort reversed, and it is the largest single change in this respecify.**

  *What it said:* "A later effort may revisit it; this one is built on both modes being
  permanent."

  It is not a later effort that revisited it — it is this one, four days after the exclusion was
  written, on the human's direction. **What it costs is written where it lands** rather than
  summarised here: requirements 2, 3, 6, 7 and 11, criteria 2, 3, 6, 12, 13 and 16, the struck
  Constraint above, and decisions 07 and 12.
- ~~**Converting a hosted workspace back to a local one.**~~ **Moot 2026-08-19** — there is no
  local workspace to convert back to. The reasoning that kept it cheap is retained under decision
  12 for the copier, which survives its decision.
- **More than one workspace per installation.** Settled 2026-08-17 against the alternative: no
  workspace list, no switcher, no per-workspace database paths. `RemoteSyncState.workspace` is
  singular and `Database::FILENAME` is the constant `"app.db"`, and this effort leaves both that
  way. The field `RemoteSyncWorkspace.local_database_path` half-anticipates the other answer and
  is **not** an invitation to take it here.

  *Reinforced 2026-08-19 and given a second reason it did not have: the sync engine's replica is
  a file plus six sidecars that only that engine may open, so a second workspace is no longer
  merely a surface this effort declined to build — it is a second live engine, which
  [[efforts/a-workspace-follows-its-user/evidence/research/turso-sync-in-the-rust-layer]] §3
  establishes is a corruption path.*
- **Organization workspaces themselves.** Designed for, not built. Personal workspaces only: one
  user, one workspace per installation, any number of that user's devices.
- **Multiple people editing one workspace.** Follows from the above and is stated separately
  because it is the exclusion most likely to be built by accident once membership is designed.
- **Shipping a web or mobile client.** The destination is readiness, not a second client. No
  package for one is created speculatively.
- **The control-plane dashboard website.** Named by the human 2026-08-18 as part of the shape and
  **not built here.** It is the always-online surface the *Architecture* describes reaching the
  API directly, and naming it is what stops the API being designed as though the desktop were its
  only caller. *Why this is a separate exclusion from the line above: a dashboard administering
  accounts and workspaces is not a client of a workspace database, so "no web client" does not
  already cover it — and an exclusion that has to be inferred is the one that gets built.*
- ~~**Building or deploying an API service.**~~ **Struck 2026-08-18**, on the human's direction:
  *"the api is used for sync/backup and for auth"*, and *"there's an online db for all accounts
  auth and workspaces association."* So an API service is **this effort's to design**, and the
  control-plane question decision 03 was to weigh — build it or buy a hosted identity service —
  is answered in favour of building.

  **What is still excluded:** nothing is *deployed* by this effort, and no production environment,
  domain, or operational surface is stood up here. The API is designed, and how it reaches users
  is a later effort's.
- **The domain model.** Contract statuses, payment rules, unit assignment and the Saudi identity
  forms are untouched. **Reinforced 2026-08-19**: one record of truth moves where rows live, not
  where rules run — the domain keeps executing on the client against the replica, and the control
  plane knows nothing of contracts.
- **Everything in [[efforts/work-the-surfaces-cannot-do/spec]] (#487).** It is still out of scope
  — but **it was built *before* this effort, not after, and it is complete as of 2026-08-18.**

  **The declared edge was wrong rather than violated.** Its tickets #492, #493, #494 and #495 each
  carried `blocked-by: #497` and every one of them shipped without a single platform decision
  being made, because none of them needed one. The dependency was asserted when this effort was
  expected to run first and was never tested; the tracker is the record that it did not hold. So
  the standing warning under decision 09 changes direction: those four are **landed code to
  re-read against whatever 09 produces**, not unbuilt work waiting on it.

  Three things it landed are now inputs to this effort rather than exclusions from it, and each is
  written where it lands: a durable `history` table, a whole-workspace export and import, and
  server-side list filtering. They are the reason this spec was re-opened on 2026-08-18.
- **The surface that decides to remove somebody.** *Added 2026-08-19 (#564).* Requirement 18 is
  that declining to renew can be *performed*. Who is entitled to decide it, and through what
  interface, belongs with organizations and membership administration — requirement 14, not built
  here. *Why this needs saying: the mechanism and the surface are one sentence apart, and
  building the second while reaching for the first is how an unowned administrative surface
  appears.*
- **An operator identity, and an audit trail.** *Added 2026-08-19 (#564).* The control plane has
  exactly one caller class — an account holder, identified by Google — and no notion of an
  administrator, no credential for one, and nothing recording who did what. **A route would need
  all three.** That is a cost for [[modes/plan]] to weigh against the command, not a thing this
  effort builds on the way past.
- **Scheduling any of it, and deploying anything.** *Added 2026-08-19 (#564), and it does not
  reverse the exclusion above.* What is in scope is that the operation can be performed at all;
  when, how often, and by what runner belongs to the later effort that stands the service up.
- **A user-facing "sign out everywhere".** *Added 2026-08-19 (#564).* The same mechanism would
  serve it, and the requirement is not it: this is an operator being able to act, not a person
  managing their own devices. Named because it is one route away.
- **Anything else that accrues.** *Added 2026-08-19 (#564).* The ticket asks for maintenance
  "and whatever else accrues", and `session` is the only table that grows without a user asking
  it to. `account`, `workspace` and `membership` grow one row per thing somebody made, which is
  data rather than garbage; a workspace database nobody deletes is decision 12's territory.
  **A requirement to prune "whatever accrues" would have no acceptance criterion**, which is the
  definition of a wish.

# Assumptions

- ~~**The chosen client can target a database this application can create.**~~ **Answered, twice,
  and struck 2026-08-19.** Decision 11 pointed `@tursodatabase/sync` at a `libsql://` database
  created through the Platform API and it synced; the Rust crate accepts the same scheme by
  construction — `normalize_base_url` maps `libsql://` and `turso://` to `https://` and has a unit
  test asserting it
  ([[efforts/a-workspace-follows-its-user/evidence/research/turso-sync-in-the-rust-layer]] §5).
- **Per-workspace databases are affordable.** The free tier gives 100 databases and paid tiers are
  unlimited, with no documented per-database size cap. Established by decision 01 against
  published pricing, not against a bill.

  **This assumption got materially heavier on 2026-08-19** and the change is worth naming: it used
  to cover the subset of users who chose a hosted workspace. **Every user now has a database from
  the moment they sign up**, including one who opens the application once and never returns. The
  free tier's hundred is now a ceiling on total accounts, not on hosted ones.
- **The user accepts that the application requires an account.** *Withdrawn 2026-08-17, and
  **restored 2026-08-19** when the human removed local-of-record.* It is the same assumption,
  worded the same way, load-bearing again for the same reason — and its round trip is left visible
  because an assumption that was explicitly retired and then quietly re-adopted is the kind that
  nobody re-examines.

  *What it said when it was withdrawn:* "It does not require one: an account is required for a
  hosted workspace and for nothing else, and local workspaces stay first-class."
- ~~**Real users other than the author run the published releases**, so the installed base is a
  population rather than a machine.~~ **Withdrawn by the human 2026-08-18, and false.**

  **Checked rather than merely withdrawn**, because it had shaped four sections: every running
  install polls `latest.json` on the newest release, and that asset on `v0.13.0` has two fetches,
  both from the session that went looking. Nothing has ever asked this application for an update.
  `v0.10.1`'s 39 installer downloads spread evenly across all six platforms with exactly one
  download per `.sig`, which is a scraper; `v0.11.0` and `v0.11.1` have none.

  **This is the assumption doing its job**: it was recorded as an assumption rather than absorbed
  into a requirement, it named what depended on it, and when it fell the blast radius was already
  written down.
- **Every user has, or will create, a Google account.** Follows from directing sign-in to Google on
  2026-08-17. It is an assumption rather than a fact because nobody has checked it against the
  actual user base, and for a Saudi rents tracker it is plausible without being established.

  *Amended 2026-08-19: the clause "A local workspace is unaffected — it needs no account of any
  kind" is struck. **There is no unaffected population.** A user without a Google account is now a
  user who cannot open the application at all, which turns a plausible assumption into a hard
  gate.*
- ~~**Record identity is assignable independently on two replicas.**~~ **Never written down, and
  false — added and struck in one line, 2026-08-18.** Every primary key was a bare rowid taking the
  next id above the highest in use, so two replicas agree on the id and disagree on the record. It
  is struck rather than omitted because a reader who does not see it here will assume, as this spec
  did, that identity is somebody else's problem. **Closed at `4bc35646`** by
  `0003_serious_synch.sql`.
- **Turso stays the vendor.** No alternative has been evaluated, and this effort does not evaluate
  one.

  **The cost of this assumption being wrong rose sharply on 2026-08-19**, and it is the single
  largest consequence of removing local-of-record that is not written as a requirement. Until then
  a vendor failure degraded the product to its local mode, which was a complete, shipping,
  first-class product. **There is now no mode to fall back to** — a vendor that fails, prices the
  application out, or discontinues the sync product takes every user's workspace with it. The
  *Open Questions* entry on an exit route is where this stops being a shrug.
- **Rust remains present on the desktop client.** Credential handling assumes it
  ([[rules/credentials]], under *Client boundary*), and as of 2026-08-19 **so does the sync engine** — it
  runs in the Rust layer behind the existing `db_execute_*` commands. A browser client would have
  neither, which is why that is an open question rather than an assumption.
- **The Rust crate behaves as the npm binding did.** *Added 2026-08-19.* Every measurement in
  decision 11 — per-column contended loss, 63-byte token rotation, a zero-byte reconcile pass — was
  taken through the NAPI binding at 0.7.2. The Rust crate is the same engine at the same version
  number, so they are expected to carry, **but that is inference and not observation**. Acceptance
  criterion 9's kept test is what converts it.
- **Whoever runs the control plane can reach the machine it runs on.** *Added 2026-08-19
  (#564).* A command a person runs assumes a person with a shell, where the process and its
  database are. It is unverifiable today because nothing is deployed, and it is written down
  rather than absorbed because **it is the whole difference between a command and a route**: the
  second needs no shell and costs an operator credential this repository does not have.
- **One person operates this.** *Added 2026-08-19 (#564).* One author, one caller class, no
  second administrator — so nothing here has to answer who acted. It is an assumption rather than
  a fact because requirement 14's organization work is the thing that ends it.

# Open Questions

- **Where does a workspace credential live on a client with no Rust process?**
  [[rules/credentials]], under *Client boundary*, puts credentials in Rust and says there is no second
  place they could be. A browser client has no Rust at all. Nothing here requires answering it for
  a browser client that is not being built — but the seam has to admit an answer.

  *Sharper as of 2026-08-19: the sync engine is now in Rust too, so a browser client needs a second
  answer for the engine as well as for the credential. The two are the same question asked twice,
  and `@tursodatabase/sync-wasm` is the candidate for the second half — see decision 10.*
- **What does an offline client do when its token is revoked or expires?** Decision 01 established
  that revocation is bulk-only, rotates every token in the group, and has no published propagation
  time. What an already-connected or offline replica does when its token is invalidated is
  undocumented.
- ~~**What does a genuinely offline first launch do**, before any successful connect has
  happened?~~ **Answered twice and struck 2026-08-19.** Decision 11 established that the client
  must be given its remote URL as a *function* answering `null` until online, never as a string —
  and the Rust crate names the same property `bootstrap_if_empty(false)`, verified against a
  non-routable remote. **And the question stopped arising**: signing up is what creates a workspace,
  so a first launch is online by definition. *The mechanism is kept in* Architecture *anyway,
  because it still governs every launch after the first.*
- ~~**Is three days the session window, or a placeholder?**~~ **Answered 2026-08-18, and
  superseded 2026-08-19.** It is not one window but two — a three-day refresh window and a
  one-month absolute lifetime — and the client believes the earlier. Now requirement 15, checked by
  acceptance criterion 16. What is *not* settled by that answer, and is decision 03's: what the
  session is on the wire, and what the client holds while offline so that "signed in three days
  ago" is a fact it can prove rather than a flag it sets itself.
- ~~**What does a reconcile pass cost over the wire?**~~ **Measured 2026-08-18 and struck.** The
  reconcile pass sends **zero bytes** and is followed by one batched push (decision 11, question
  6). It is not free of the concern that produced it — the whole-table pass still runs at every
  application start — but it is no longer an unknown, and it does not decide whether the
  architecture is usable.
- **Is there a route out?** *Rewritten 2026-08-19, and it is now the most consequential question
  in this section.*

  It used to read *"Is the conversion one-way?"*, and its answer was cheap because local-of-record
  existed: a user who stopped paying, lost trust in the vendor, or changed their mind had a
  complete product to fall back to, and *Out of Scope* declined to build the route only because
  nobody had asked for it. **Neither half is true now.** There is no local mode to return to, and
  the *Assumptions* entry above records that a vendor failure now takes every workspace with it.

  What has to be settled is not a conversion but an **exit**: whether a user can get their whole
  workspace out in a form that outlives this application and this vendor, and whether that is a
  product surface or an operational favour. #536's whole-workspace export is the nearest thing that
  exists and it is not equal to the job — it names records instead of carrying ids and recomputes
  derived values, so what comes out is equivalent in content and not identical in rows. **This is a
  product call and it is the human's.**
- ~~**Does a local workspace get an account-free identity at all?**~~ **Moot 2026-08-19.** There is
  no local workspace and no user the application does not know.
- ~~**What does the mode choice look like the first time a new user opens the application?**~~
  **Moot 2026-08-19 as asked, and it leaves a real question behind.** There is no fork and no mode
  to present. What survives is that **every user this application will ever have arrives through
  the first-run screen** — there is no population that inherits a workspace — and that screen is now
  a sign-in wall rather than a choice. Getting it wrong no longer makes an optional account feel
  mandatory; it is the only door, and a user who cannot get through it has no product at all.
- ~~**Where does ADR 0001 live now?**~~ **Resolved 2026-08-17.** It is [[rules/api-layer]], under
  *One database client type*, restored from `.claude/decisions/` in history and verified against the
  tree first: `memory.ts` does build its client through `createDatabase`, and `seed.ts`/`purge.ts`
  are still on `drizzle-orm/better-sqlite3`, so the rule's obligation and its named exclusion both
  still hold.
- **Does declining to renew owe a record of itself?** *Added 2026-08-19 (#564).* It deletes rows
  and answers a count, and **the rows that would have said somebody was removed are the ones it
  removes** — so afterwards nothing anywhere says a decision was made, by whom, or when. Under one
  operator that is tolerable; under requirement 14's organizations it is not, and the cheap moment
  to settle it is before the invocation exists rather than after. **This is a product call and it
  is the human's.**

# Risks

- **There is no longer a mode to fall back to, and that is the largest risk on this effort.**
  *Added 2026-08-19 with the removal of local-of-record.* Until then, every vendor risk below
  terminated somewhere survivable: a preview engine that broke, a price that moved, a product that
  was discontinued, a gate that closed — each degraded the application to its local mode, which was
  a complete, shipping, first-class product. **Every one of them is now unbounded.** It shows up as
  a class of incident this application has never had to have a plan for: not a feature failing, but
  every user's workspace becoming unreachable at once, for a reason nobody here controls.

  The mitigations are not in this file yet and each is small next to what it insures: an exit route
  that gets a workspace out whole (*Open Questions*), and a vendor-independent artifact the user
  already holds. **Naming it as the top risk is what stops it being absorbed as the cost of the
  architecture**, which is how it will otherwise read once the requirements are built.
- ~~**Two replicas of one workspace assign the same record ids, and nothing in the schema prevents
  it.**~~ **Closed 2026-08-18 at `4bc35646`.** Every primary key was `integer('id').primaryKey()` —
  a bare rowid with no `AUTOINCREMENT` — so two disconnected replicas computed the same next id for
  different records and, under last-push-wins, one insert overwrote the other. **Two payments became
  one payment**, with no contention and nothing to point at.

  `0003_serious_synch.sql` replaces every primary and foreign key with a client-minted UUIDv7 held
  as `TEXT`. It is struck rather than deleted because it is the reason the identity work was
  sequenced first and sized largest, and because acceptance criterion 17 exists to keep it closed —
  that criterion demands the collision be captured as a failing test *before* the fix, so what
  closed it is demonstrated rather than assumed.
- **The engine is pre-1.0, in early preview on Turso Cloud, and the chosen crate version is a
  pre-release.** *Sharpened 2026-08-19.* This puts the foundation of the whole application on a
  preview offering, and a breaking change in it is a change to the layer everything else stands on.
  **`turso` 0.8.0-pre.4 was chosen over the 0.7.2 stable deliberately** — 0.7.2 predates PR #8103,
  which fixed a crash before the first checkpoint silently losing the entire first WAL epoch while
  `integrity_check` reported ok — so the exposure is knowingly taken and the alternative was worse.
  It shows up as an upgrade that cannot be taken and cannot be refused.
- **Last-push-wins overwrites a losing writer's values silently.** For a payments ledger that is a
  data-loss shape rather than a merge policy. *Amended 2026-08-18: decision 11 measured it live and
  the loss is **per column**, not per statement — materially better than this risk assumed, and
  still a loss.* A row deleted under a concurrent edit is taken whole with no error on either side.
  It shows up as a payment that was recorded and is not there, with nothing to point at.

  **`history` is where this bites hardest** and it is worth keeping beside the risk rather than in
  *Scope*: it is the only table whose rows are inserted and never updated, so two devices' histories
  do not merge into one longer history — one replaces the other, and what is lost is the very record
  that would have said so.
- **Offline-first erodes by accident, and that is a violation rather than a trade.** The simplest,
  best-documented and production-supported configuration is read-only when disconnected, every
  pressure during implementation points at it, and it has been explicitly rejected — so drifting
  into it is not a decision anybody may make quietly at build time. It shows up as a workspace that
  reads fine offline and fails to save, discovered by a user with no signal.
- ~~**The hosted architecture can fail its gate, and the effort has agreed to stop rather than
  degrade.**~~ **The gate ran 2026-08-18 and it is a GO.** Requirement 7 is met: a replica accepts
  writes with no network and pushes them when the network returns.

  **What replaces it is narrower and is not discharged** *(2026-08-19)*: every one of decision 11's
  measurements was taken through the npm NAPI binding, and the engine now runs in Rust. It is the
  same engine at the same version, so they are expected to carry — **but no push, pull, conflict,
  rotation or reconcile has been observed through the Rust API against a live database.** It shows
  up as a gate everybody believes passed, for a client nobody ran it against. Acceptance criterion
  9's kept test is the mitigation.
- ~~**The update that reaches existing machines is the highest-consequence moment in this
  effort.**~~ **Struck 2026-08-18 — it was the largest risk here, and it reached no machines.**

  It is struck rather than deleted because **the failure mode it names is still real** — a workspace
  that opens fine and is quietly wrong — and is simply no longer reachable by this route. If this
  application ever ships a change to identity *after* it has users, this risk comes back exactly as
  written.

  *The remainder it left behind — that the keys still change over a populated workspace under
  acceptance criterion 1 — is discharged as of 2026-08-19: criterion 1 no longer manufactures a
  populated pre-effort workspace, and the migration runs against an empty database.*
- ~~**Two permanent modes double the surface every decision has to answer for**, and the second mode
  is the one nobody is excited to build.~~ **Struck 2026-08-19, by the removal of the second mode.**
  It said local-of-record would quietly rot — a path that still compiles, is never exercised, and
  breaks in a release nobody tested it in.

  **It was a correct risk and it was resolved in the direction it warned about**, which is worth
  recording plainly: the mode that nobody was excited to build is the mode that was removed. The
  saving is real — criteria 7, 8, 12 and 16 each shed a second half, and no rule has to be true
  twice.
- **Identity and backup shared one provider, and one of them is leaving.** The application keeps a
  Google dependency for authentication while deleting the feature that dependency was originally
  built for. It shows up as an OAuth scope set that outlives its justification and nobody prunes —
  a concrete obligation on the retirement rather than a hazard: **the Drive scopes go when the Drive
  code does, and the sign-in scopes stay.**
- ~~**A local workspace's off-machine route is now manual, and nothing warns a user who is not
  exporting.**~~ **Moot 2026-08-19** — there is no local workspace, and every workspace's off-machine
  route is continuous replication. *This is the one place the reversal makes a user strictly better
  off, and it is recorded so the ledger of this change is not read as all cost.*
- **Requiring a Google account excludes whoever does not have one**, and **there is no longer an
  answer for them.** *Sharpened 2026-08-19.* This risk previously ended "…cannot be answered with
  'then use local mode' for a user who specifically wants their workspace on two machines" — the
  escape hatch existed for everyone else. It exists for nobody now. It shows up as a user who wants
  the product and cannot have it, for a reason unrelated to rent.
- **The backup surface is being deleted and two things depend on it.** *Added 2026-08-19.* The
  updater takes a protected snapshot before installing, and `startup-recovery.svelte` offers a route
  back from a workspace that will not open. Deleting 1,899 lines of Rust plus its surfaces is
  straightforward; deleting the guarantees underneath them is not, and the deletion looks complete
  either way. It shows up as a failed update with nothing to roll back to, discovered by the first
  user it happens to. Requirement 17 and acceptance criterion 18 are the mitigation.
- **Two live engines must never hold the replica file, and nothing enforces it.** *Added 2026-08-19
  from the Rust research.* `sqlx` and `turso` are in disjoint locking domains — turso's WAL index is
  `-tshm` where SQLite's is `-shm`, its Windows lock byte is at `0x4000000000000000` where SQLite's
  lock page is at `0x40000000`, and its Unix `F_SETLK` is invisible to a second descriptor in the
  same process. `COMPAT.md` forbids the arrangement; no error reports it. It shows up as corruption
  with no event at the moment of the mistake. **Change capture is the second half of the same
  problem**: a write made through `sqlx` produces no `turso_cdc` row and therefore cannot be pushed,
  so a mixed write path yields a workspace that syncs some writes and silently drops the rest.
- **`simsimd` is a non-optional C dependency of `turso_core` on every desktop target**, with the
  opt-out PR still unmerged. *Added 2026-08-19.* This repository has been careful to keep its Rust
  tree free of C build dependencies it does not need — the `sqlite-bundled` choice is the one
  deliberate exception. It shows up as a build that breaks on a platform or toolchain nobody tested,
  most likely at release time.
- **Turso's schema-propagation feature is deprecated for new users** — the one feature built for
  exactly the per-workspace shape this effort chose. It shows up at decision 06 as an absence rather
  than an obstacle.
- ~~**Nine open decisions are a lot of unresolved architecture for one spec.**~~ **Reduced to a
  narrow remainder, and reopened in one place.** 06, 07, 09 and 12 are decided; what 2026-08-19
  reopened is **10 and 11**, which the engine's move to Rust invalidated as written.

  *The sentence also ended "which is why the sizing below reports the top floor", and there is no
  sizing section in this file. A cross-reference to a section that does not exist is the cheapest
  kind of defect to leave and the most annoying to meet, so it is removed rather than repaired.*
- **Declining renewal for the wrong account is silent until somebody is locked out.** *Added
  2026-08-19 (#564).* The operation takes an account, ends every session it has, and answers a
  number that looks identical whether it was the right one. There is no undo worth the name — the
  person signs in again — but there is no signal either, so it surfaces hours later as a user
  reporting that the application asked them to sign in.
- **A prune written against the wrong window would eat live sessions.** *Added 2026-08-19
  (#564).* `forgetExpiredSessions` keys on the absolute lifetime, which is correct; a caller that
  writes its own `delete` against `expires_at` instead removes exactly the sessions requirement 15
  promises are refreshable. It shows up as criterion 16 failing on a machine that was merely
  offline for a weekend.

# Architecture

*Rewritten 2026-08-19 for one record of truth and a Rust-layer sync engine. What the two-mode
version said is kept where the reasoning still earns its place, and struck where it does not.*

## The shape, as directed

**Three tiers, and the middle one is never in the data path.**

1. **A workspace database per workspace, hosted on Turso.** Of record remotely, replicated
   locally. Every client holds a replica and syncs **directly** with Turso. *Why not through the
   API: every read and write would cross infrastructure this repository operates and pays for, to
   add nothing the vendor is not already doing.*
2. **A control-plane API and its database, built here.** Accounts, Google sign-in, workspace
   records, the account-to-workspace association, workspace-database creation, and **minting the
   token a client syncs with**. Always-online clients — the control-plane dashboard site — read
   and write through it directly, because it already holds the credentials that make that
   possible.
3. **The desktop client**, which is what exists today, gaining a session and losing its local
   record of truth.

**Domain logic does not move.** Routers, reconciliation and every derived status keep running on
the client against the replica; the control plane holds accounts and workspace association and
knows nothing of contracts. *Stated because one record of truth invites the opposite reading, and
because the alternative — the domain on the server — is the shape this Architecture rejects
below.*

## The engine runs in Rust, and that is a change

**Directed by the human 2026-08-19.** The sync engine sits in the Rust layer, behind the
`db_execute_single_sql` and `db_execute_batch_sql` commands that already exist. The web layer is
unchanged: `createDatabase(single, batch)` still receives two functions that call `invoke`, and
still returns one `SqliteRemoteDatabase<typeof schema>`.

**Why it moved, and it is not a preference.** Decision 10 chose `@tursodatabase/sync` and decision
11 validated it against a live account — in Node. The package is a **native NAPI addon** whose
entry imports `node:fs` through `createRequire`, and this frontend is `adapter-static` inside a
WebView2 with no Node. Referencing it from `client.ts` **still builds**, emitting raw source with
bare specifiers, so the failure is silent until a workspace opens. Decisions 10 and 11 carry the
reversal and the options that lost.

**The crate is `turso` 0.8.0-pre.4, `default-features = false, features = ["sync"]`.** *Chosen by
the human 2026-08-19 over the 0.7.2 stable.* Default features are off deliberately: `mimalloc`
installs a global allocator for the whole Tauri process, and `fts` pulls `tantivy` into the
binary. Decision 10 carries the version reasoning.

**Three properties of the engine are fixed by evidence rather than chosen**, and each is invisible
until the day it matters:

- **The remote URL is given as a function, never as a string.** Handed a string naming a remote
  that cannot be reached, the client throws and leaves no usable local database. In Rust this is
  `bootstrap_if_empty(false)`, a named builder method verified against a non-routable remote:
  `build()` returns, offline writes are accepted, and `push()` fails with a named error rather
  than hanging.
- **The auth token is given as a function too** — `with_auth_token_fn`, resolved per request, so a
  short-lived token is replaced without the replica being rebuilt. Rotation costs 63 bytes,
  measured. **The whole credential model rests on this**, and it is a first-class API rather than
  a hope.
- **The crypto provider must be installed before the engine's first request.** `turso/sync` forces
  `aws-lc-rs` in beside `ring`, and with both rustls providers present and none installed the
  failure is a panic on turso's IO thread that reaches the caller as a **hang**. This repository's
  `install_crypto_provider()` in `src/http.rs` already prevents it — which turns a hazard into a
  startup-ordering requirement rather than work.

## One file, one engine — the constraint everything else bends around

**`sqlx` and `turso` must never hold the replica open at the same time, and nothing enforces it.**
The two are in disjoint locking domains: turso's WAL index is `{db}-tshm` where SQLite's is
`-shm`; on Windows turso's open-time lock is one byte at `0x4000_0000_0000_0000` where SQLite's
lock page is at `0x40000000`; on Unix its `fcntl(F_SETLK)` is invisible to a second descriptor in
the same process. `COMPAT.md` states the prohibition — *"We don't support mixed SQLite and Turso
in multi-process scenarios"* — and no error reports a breach.
[[efforts/a-workspace-follows-its-user/evidence/research/turso-sync-in-the-rust-layer]] §3 has the
citations.

**Change capture is the second half of the same constraint.** CDC is armed per connection with
`PRAGMA capture_data_changes_conn`, a turso-only pragma. A write made through `sqlx` produces no
`turso_cdc` row and **cannot be pushed**. A mixed write path yields a workspace that syncs some
writes and silently drops the rest.

**So the engine owns the file outright**, and this is the single structural decision the Rust move
forces. `Database` holds one engine, and for a workspace replica that engine is `turso`. Nothing
else opens the file — not the migration runner, not a backup, not diagnostics.

**Designing so that nothing but the engine touches the replica also closes an open unknown for
free.** If the remote speaks the MVCC protocol, the engine runs `PRAGMA journal_mode = 'mvcc'`
against the local database on first contact, after which the header still reads `SQLite format
3\0` and stock SQLite answers `SQLITE_NOTADB`. **Whether Turso Cloud speaks it is not
established** — it is one request against a real database. It does not have to be answered,
because no code path depends on the replica being readable by anything else.

*Three obligations already fell away before this rule was written, which is why it is cheap:*
decision 06 moved migrations to the control plane, decision 07 retires Drive, and requirement 17
retires the backup surface. The three things that would otherwise want to open that file are gone.

## The API is in the credential path continuously and in the data path never

That single property is what makes the shape work, and three requirements land on it:

- **Requirement 15 is enforced by token lifetime rather than asserted by the client.** Tokens are
  short-lived and refreshed against the API. A client that cannot reach the API cannot renew, and
  when its refresh window closes it cannot sync. *Why this matters: a window implemented as a
  client-side flag is a window the client can simply not close. Implemented as a TTL, the client
  cannot fake it, because the thing it needs is issued elsewhere.*

  **Two windows, and the client believes the earlier** *(2026-08-19)*. The three-day refresh window
  slides on every successful reach; the one-month absolute lifetime is set at sign-in and **never
  moves**. `control.rs` already carries two moments and believes the earlier — but they are
  *session* and *replica credential*, and the absolute lifetime is a third thing that does not
  exist yet on either side.
- **Revocation gets an answer the vendor does not give.** Decision 01 established Turso's own
  revocation is bulk-only, rotates every token in its group, and has no published propagation time
  — unusable for removing one member. **Declining to renew is per-user and takes effect at the
  next refresh**, which is a bound this repository sets rather than inherits.
- **A second client kind stops being a rewrite.** An always-online client needs no vendor SDK and
  holds no workspace token; it uses the API. An offline-capable one syncs direct. *Amended
  2026-08-19: with the engine in Rust, an offline-capable client that is not the desktop shell now
  needs an engine as well as a credential — see* Open Questions.

**The cost, accepted knowingly: permissions on a shared workspace will be coarse.** A disconnected
client holds a credential good for its whole workspace database for the length of its offline
window, so **membership grants full workspace access and roles govern administration only**.
Fine-grained per-record permissions and offline writes are mutually exclusive; routing data
through the API would not fix it, only move the enforcement point to a server the offline client
is by definition not talking to. This is decision 05's first shape, chosen. *It binds nothing
today — one account, one workspace, one member — and it is what requirement 14's organization work
inherits.*

*Rejected, and named so it is not re-proposed:* **all data through the API.** It buys enforceable
fine-grained permissions and vendor independence, and costs this repository the convergence engine
and the offline write queue — the work decision 10 chose its client specifically to avoid — plus
the infrastructure usage the direct path exists to avoid. It is the right answer only where
fine-grained permissions outrank offline writes, and requirement 7 says they do not.

## Identity comes before all of it, and it is built

**A record's identity is a UUIDv7 held as `TEXT`, generated on the client that creates the
record.** *Chosen by the human 2026-08-18 from four options; the alternatives and their costs are
decision 13.* Time-ordered, so inserts stay sequential and index locality behaves like the rowid it
replaces; generated with no coordination, so it works offline by construction.

**Landed 2026-08-18 at `4bc35646`.** `0003_serious_synch.sql` builds an `idmap`, rewrites all six
tables, and drops `idmap`. *Amended 2026-08-19: this section described the migration as "the
largest single piece of work on this effort" and as being applied to a populated workspace. It is
done, and with one record of truth it runs against a database the control plane created moments
earlier.*

**It deletes code rather than adding it**, which is the one cheerful consequence: `importWhole`
read `max(id)` for five concepts (`src/lib/workspace/router.ts:260-276`) and renewal read
`max(contract.id)` (`src/lib/contract/router.ts:435-446`). A client-generated identity is known
before the insert, so both disappear.

## What was settled by the code, and what 2026-08-19 changed about it

*Each row was checked in the tree rather than recalled.*

**The transport seam still admits this, and it is the reason the change is affordable.**
`createDatabase(single, batch)` (`src/lib/platform/database/client.ts:47`) takes two functions and
returns one `SqliteRemoteDatabase<typeof schema>`; production passes Tauri's `invoke` (`:61`),
tests pass an in-memory engine (`memory.ts:63`). **The engine moving to Rust makes this *more*
true, not less** — the two functions keep calling `invoke`, and what changes is which engine is
behind the command. [[rules/api-layer]], under *One database client type*, is satisfied
structurally.

*One sentence of that rule is now imprecise and should be corrected where it lives:* it records
that "the gate drove the chosen sync client through `createDatabase(single, batch)` against a live
database and it went through unchanged." True, and it was driven in Node. The conclusion holds;
the evidence behind it does not describe the client this application will ship.

**The mode discriminator is being removed rather than extended.** *Reversed 2026-08-19.*
`RemoteSyncProvider` is `Local | GoogleDrive` (`tauri/src/sync/store.rs:37`), `#[default] Local`,
mirrored in TypeScript at `apps/desktop/src/lib/platform/host.ts:88`. The plan was to add a third
value; with one record of truth there is nothing to discriminate, so the enum and every site
branching on it are deleted. *Components* carries the count, which is nine and not seven.

**Identity is a member of the request context, and it stops being optional.** ***Built 2026-08-18
by #547.*** `Context` was `{ db, clock, host }` and is now `{ db, clock, host, identity? }`.
**The `?` was built for a case that no longer exists** — it was optional precisely because a
local-only user never signed in. Requirement 10 now says identity is present on every request, so
making it required is a real change to `Context`, to `context()`, and to
`src/lib/api/tests/context.test.ts`, and it is named here rather than discovered.

*Three things #547 settled that survive the change:* the key was omitted rather than set to
`undefined`; a shell that cannot answer has not said the workspace is hosted, because the read runs
while the application is still starting; and the context is built once at module load, so the
identity it resolves is the one the workspace had then.

*Rejected:* a required identity with an anonymous placeholder. Decision 03 names it "the harder of
the two failures" — it makes a request carry a fiction indistinguishable from a real user at every
call site. **Requirement 3 removes the need for it**: there is no request without a signed-in user.

# Components

*Each row was read in the tree on 2026-08-19.*

| Component | Where | What changes |
| --- | --- | --- |
| the transport seam | `src/lib/platform/database/client.ts:47` | **Nothing.** It already admits this; recorded so it is not "improved" |
| **the Rust database engine** | `tauri/src/database/mod.rs` — `Database` holds `Option<Pool<Sqlite>>` | becomes a two-variant engine; `connect()` builds one arm and stops running migrations |
| **the proxy row mapping** | `tauri/src/database/proxy.rs:58` — `value_at` decodes by storage class | a second mapping for turso's value types, behind the same `SQLRow`; the two must agree and nothing forces them to |
| **the mode discriminator** | `tauri/src/sync/store.rs:37`, mirrored `src/lib/platform/host.ts:88` | **deleted**, not extended |
| the flows that branch on it | **five files**, listed below | each loses its branch |
| the request context | `src/lib/api/context.ts:36` and its builder at `:52` | `identity?` becomes required |
| the host port | `src/lib/api/context.ts:27` | decision 08's inversion, **taken** |
| every primary and foreign key | `src/lib/platform/database/schema.ts` — twelve columns | **done** at `4bc35646` |
| the two `max(id)` call sites | `src/lib/workspace/router.ts:260-276`, `src/lib/contract/router.ts:443` | **deleted** |
| **the local migration runner** | `tauri/src/database/migrations.rs` (770 lines), called from `mod.rs`'s `connect()` | **retired from the startup path.** `tauri/migrations/` survives only as `build.rs`'s input for `WORKSPACE_SCHEMA_VERSION` |
| **the backup surface** | `tauri/src/backup/` — 1,899 lines across four modules — plus `startup-recovery.svelte`, the settings surface, and `ar`/`en` strings | **deleted**, once requirement 17's two dependants have answers |
| **the Drive sync surface** | `tauri/src/sync/google/**`, `src/lib/sync/**` | **deleted** (decision 07) |
| the control-plane API | `apps/control-plane/` | accounts, sign-in, workspace records, association, database creation, token minting |
| **the session** | `tauri/src/sync/control.rs`, `apps/control-plane/src/session/session.ts` | the three-day refresh window exists; **the one-month absolute lifetime does not** |

**The discriminator's population, counted 2026-08-19 and stated as files rather than as a
number.**

| File | `'googleDrive'` occurrences |
| --- | --- |
| `src/lib/settings/component/sync.svelte` | 7 |
| `src/lib/sync/workspace.ts` | 3 |
| `src/lib/layout/component/startup-workspace-choice.svelte` | 2 |
| `src/lib/sync/pending-conflict.ts` | 1 |
| **`src/routes/+layout.svelte:247`** | 1 |

**This count has now been wrong twice, and the second time is instructive.** It was first recorded
as **seven**, which was the whole population of the *sync dispatcher* rather than of the tree —
`sync.svelte` labelled the provider and `startup-workspace-choice.svelte` badged it, both by
elimination (`=== 'googleDrive' ? … : local`), and both were missed. It was then corrected to
**nine**, and **nine is also wrong**: `src/routes/+layout.svelte:247` branches on the provider at
startup and appears in no previous inventory.

**So the lesson is not "count more carefully" — it is that a number in this table decays.**
The files are named instead, the per-file occurrences are given so a reader can tell whether the
tree has moved, and **whoever removes the discriminator derives the count fresh rather than
trusting this one.** The check that closes it is acceptance criterion 2's tree search returning
nothing, which cannot be satisfied by a stale inventory.

# Data Model

*Written 2026-08-18, after the shape was directed. Two databases, and they share nothing.*

**The workspace database** is today's schema with one change applied uniformly: every `id`
becomes `text` holding a UUIDv7, and every column referencing one follows —
`contract_unit.contractId` and `.unitId`, `payment.contractId`, and `history.recordId`. Nothing
else about the domain moves; requirement 13's *Out of Scope* keeps contract statuses, payment
rules and unit assignment untouched.

**`history` is the table to watch**, and it is worth its own line because it is the newest and
the least like the others. Its rows are only ever inserted, its `recordId` points at a record it
does not constrain with a foreign key, and it stores `record` — the name a record had at the
time — precisely so that a deleted record still reads. Under the identity migration its
`record_id` values must be remapped by the *same* mapping applied to the records themselves, or
every history entry in a converted workspace silently points at nothing. **Nothing in the schema
would catch that**, because there is no foreign key to violate — which is why acceptance
criterion 1 names history explicitly.

**The control-plane database** holds accounts, workspaces, membership, and nothing about the
domain. It is a separate description rather than a second consumer of the domain schema — **which
answers the question the monorepo effort's plan left open**: its removal condition for extracting
the schema into a package was "a second consumer exists", and the control plane is not one. The
schema stays where it is, in `apps/desktop/`, until something else consumes it.

***Built 2026-08-18 by #549, so the paragraph above now describes code.*** It is
`@rentable/control-plane` at `apps/control-plane/`, and its schema is three tables — `account`,
`workspace`, `membership` — with `apps/control-plane/src/database/tests/schema.test.ts` asserting that the set
is exactly those three. **"No domain table" is therefore a test rather than an intention**, which
matters because nothing else in the tree would object to one: a contract table here is the first
step of the shape *Architecture* rejects, and it would arrive looking like a convenience.

Three things the build settled that were open, each because the package forced the question:

- **What an account holds beyond `RemoteSyncAccount`, which is decision 03's remaining design
  question and its instruction to report what reuse costs.** The answer is that reuse costs
  almost nothing and keeps almost nothing: `id`, `email`, `displayName` and `avatarUrl` carry
  over unchanged; `googleUserId` occupies the same *slot* as `providerUserId` and is
  ***a different identifier*** — corrected 2026-08-18 by #555, and the correction matters, see
  below — and it is not nullable, because an account exists here *because* Google vouched for
  it where the desktop's row can precede the profile fetch. **Everything else on that type is
  Drive's or the credential's** —
  quota and usage bytes, `tokenExpiresAt`, `refreshTokenAvailable`, `lastSyncedAt`, `status`,
  `lastError`. None of it describes a person. So the control-plane account is the identity half
  of `RemoteSyncAccount` and nothing more, and the two are not one type shared across a boundary.
- **Where a workspace's database coordinates go is not here yet, deliberately.** The record
  carries id, name, owner and timestamps; the `libsql://` database #556 creates and the schema
  version #557 settles are columns those tickets add. A column null on every row documents
  nothing.
- **Foreign keys are declared in the control-plane schema and are absent from the workspace
  schema**, which is a difference rather than an inconsistency: this database is single and
  always online, where the workspace database is replicated to machines that write to it
  offline — a constraint one replica satisfies can be violated by the merge. Its migrations are
  also drizzle-kit's applied by drizzle-kit, not the Rust runner that rejects any file
  containing a `PRAGMA`.

***Signing in was built 2026-08-18 by #555**, and it settled the protocol question #549 left
open, along with one thing nobody had noticed.*

**Plain JSON over HTTP.** `POST /account/sign-in` takes a Google access token and answers with
an account. tRPC's whole return is end-to-end inference into a TypeScript client, and the only
client there will be is the Rust side — credentials never cross the IPC boundary, so the web
layer is not the caller and cannot become one. The desktop's own tRPC is not a precedent either:
it runs in-process in the webview with no HTTP under it. *Rejected, so it is not re-proposed:
tRPC over HTTP for the sake of matching the desktop, which would buy a shape and cost the Rust
side a hand-written encoding of a wire format designed to be generated.*

**`RemoteSyncAccount.providerUserId` is not Google's subject, and the two had been treated as
one.** The desktop fills it from Drive's `permissionId`
(`apps/desktop/tauri/src/sync/google/files.rs`, `DriveAbout::into_account_details`), which
identifies the same person under Drive's own scheme rather than under OpenID Connect's. The
control plane matches accounts on the `sub` claim, per acceptance criterion 4's requirement that
it not match on an email address — so the column is a **different identifier occupying the same
slot**, and a future ticket that copies one into the other would silently make one person two
accounts.

**Which forced a change to the desktop's scopes**: `openid` is now requested alongside `email`
and `profile` (`apps/desktop/tauri/src/sync/google/auth.rs`). It is OpenID Connect that defines
`sub` and requires it in a UserInfo answer; without `openid` the grant is plain OAuth 2 and `sub`
is undefined rather than promised. It asks for no data the other two do not already grant, and a
Rust test fails if it is ever dropped — the failure would otherwise surface at the API, on a
machine nobody is looking at.

**Verification is a call to Google's UserInfo endpoint, not a signature check.** An access token
is opaque, so asking the issuer is both the only way to learn who it belongs to and the only way
to learn it is still live — a token revoked a minute ago fails immediately, where a self-contained
ID token would have kept verifying until it expired. It costs one request per sign-in, against a
control plane that is talking to Turso on most operations anyway.

**Three refusals, typed, because the client's next move differs for each**: Google refused the
token (sign in again), Google could not be reached (retry with the same token), and Google
answered without a subject (a defect, and it refuses rather than falling back to the email —
which is the exact thing criterion 4 rules out). An unexpected failure tells the caller nothing:
its text names tables and paths.

**The unique index on the account's email is gone, and #549 was wrong to have written it.**
Implementing the matching is what showed it: an address can be freed and reassigned — a workspace
domain giving a departed employee's address to their replacement is the ordinary case — and the
replacement is a different Google subject, so a different person and a different row. The
constraint would have refused their *first* sign-in with a violation, which is an email address
deciding who somebody is by the back door, in the same breath as a criterion forbidding exactly
that. It is a second migration on this package rather than an edit to the first, because the two
are two tickets. Nothing looks an account up by email.

**Finding an account is one statement, not a read and then a write.** Two first sign-ins for one
person arriving together both find nothing, both insert, and the second is refused — somebody's
very first sign-in failing because they were quick. An upsert on the subject removes the window,
and `createdAt` is absent from its update half so an account that was found keeps the day it was
made.

**Nothing on the desktop calls any of it**, which is requirement 3 rather than an omission: a
local-only workspace reaches no account, and the occasion to sign in to the control plane arrives
with the mode choice (#553), not with signing in to Google.

***A workspace and its token were built 2026-08-18 by #556.*** Creating a workspace creates a
database of its own on Turso, a record naming it, and the asking account's membership as owner;
`POST /workspace/{id}/token` mints a Turso token scoped to that one database.

**The token lives three days, and that number is requirement 15 rather than a tuning choice.**
The requirement is that a signed-in client survives three days without a connection and that any
connection inside the window renews it — so the window *is* the expiry, and picking a different
number would be picking a different requirement. #550 demonstrates it and gets to disagree.

**Membership is read on every mint, which is the whole of how somebody is removed.** Decision 01
found Turso's own revocation is bulk-only and rotates every token in its group with no published
propagation time, so it cannot remove one person. Declining to renew can: per-user, effective at
the next refresh, bounded by the token lifetime. There is nothing to propagate and nothing to
expire — the account either has a row when it next asks or it does not.

**The database is created before the record naming it, and removed again if that record cannot be
written.** The other order leaves a workspace naming no database, which every reader then has to
carry for a state only a crash produces; this order leaves at worst an unreferenced database, and
only where the removal also fails, which is logged. The record and the owner's membership are one
transaction, because the failure *between* them is worse than either alone — a workspace nobody
is a member of is one nobody can reach and nobody can delete.

***Run against the live Turso account 2026-08-18, at the human's request***, creating a database,
minting a token and attempting to delete it. Four things confirmed and one found:

- `expiration=3d` yields a token whose `exp - iat` is exactly 259200 seconds, and whose `id`
  claim is the database's own id — so *scoped to one database* and *short-lived* are properties
  of the credential rather than promises about it.
- The documented capitalised `Hostname` is real, the hostname carries the organization slug, and
  a `ws-<uuid>` name is 39 of the 64 characters Turso allows.
- **A delete-protected group refuses to delete the databases inside it**, answering about the
  group rather than about what was asked, on a database whose own protection is off. This
  account's group is protected, so **the cleanup path cannot run here**: an interrupted creation
  leaves an unreferenced database behind, logged, until somebody removes it by hand. The code was
  already best-effort and is unchanged in shape; what changed is that its failure is now known
  rather than hypothetical, and a permanent refusal from Turso no longer advises a retry that
  cannot succeed. [[references/turso]] carries it.

**Every route but `/health` takes `Authorization: Bearer`, and there are two credentials on
it.** *`/account/sign-in` was moved onto the same header by #556, correcting #555 one commit
later*: it read the token from a JSON body, which was fine while it was the only route and became
two ways of saying one thing the moment there was a second.

**The session exists, and #550 built it.** A Google access token is what somebody signs in with;
it buys a session — a token the control plane issues, held in a `session` row as a SHA-256 digest,
good for three days, and told apart from Google's on the wire by an `rws_` prefix. **Every route
renews the session it was reached with**, which is what makes requirement 15's *any connection
inside the window renews it* a property of the API rather than of any one route;
`POST /session/refresh` is there for a client that is doing nothing else. Signing in is still not
a precondition for the other routes: each performs it, so a client whose first request creates a
workspace reaches the account it would have reached and is issued a session on the way.

**What the session replaced is re-verifying with Google on every request.** The cost, accepted:
a Google token revoked mid-window is unnoticed until the session runs out — which is the bound
removing somebody already had, and part of why the window is three days rather than thirty.

**Two windows, and they are started by different calls.** The session's is moved by any reach;
the Turso credential the replica syncs with is restarted only by the mint. Equal lengths do not
make them one clock, so **the mint answers with both** and is the renewal a client holding a
workspace uses, and **the client believes the earlier of the two numbers it holds**. Left
unstated, this reads as one window and a client goes on replicating after the credential that
carries replication has died.

**What remains open, and it is a spec question rather than a defect**: `asking` accepts a Google
access token on any route, and the desktop holds a Google refresh token behind the credential
boundary. So a client whose three-day window has closed can obtain a fresh access token with no
user interaction and start a new session silently. Whether requirement 15's *asks for a sign-in*
means **the client reaches the API again** — satisfied — or **the user acts** — not satisfied —
was not decided here. #550 recorded it rather than choosing, and the refusal string it wrote
(*sign in with google again*) is written for the second reading.

**Acceptance criterion 5 — no route returns a domain row — is asserted structurally rather than
route by route**, because the failure it guards against arrives *with* a new route and a list of
routes covers only the ones somebody remembered. A domain row could come from a domain table in
this database, which one test fixes at exactly three, or from a module imported out of the desktop
application, which a second test forbids. There is nowhere else it could come from.

*What #555 did **not** satisfy, stated rather than quietly reinterpreted:* its acceptance
criterion that an account carry **at least what `RemoteSyncAccount` already carries** is not met
on its letter. That type has sixteen fields and the control-plane account has seven; the nine
missing are Drive quota and usage, app usage, token expiry, whether a refresh token exists, the
last sync, the account status and the last error — none of which describes a person, and several
of which would be a lie on a row this database owns. Decision 03's own instruction is to *start
from reusing them and report what it costs*, which is what `Data Model` above does. The letter of
the criterion is unmet and the departure is recorded here rather than accepted silently.

***A hosted workspace's schema was settled at the mint 2026-08-18 by #557**, which is decision 06
built.* The workspace record carries `schema_version`, the client sends the version it was built
against with its token request, and the mint answers in one of four ways: equal — mint; newer —
migrate that workspace database up to the client's version, then mint; older — refuse
`client_out_of_date` and issue no token; newer than anything the running API ships a migration
for — refuse `service_out_of_date`.

**The refusal is decided twice, and the second time is against the version the workspace database
actually reached.** *A defect found in review: the first commit compared the client against the
workspace **record**, which is an index of the database's own ledger and can lag it — a sweep
running while a mint runs is the ordinary way there. A client above the stale number passed the
test, triggered a migration that applied nothing, corrected the column upward, and was handed a
credential for a schema it did not understand.* The migration therefore answers with where the
database got to, and a mint whose migration reached higher than the client asked for refuses. The
same failure path now records the version reached even when a migration fails part-way, so the
column does not lag the ledger after a failure at all.

**The fourth answer is not in decision 06 and the mechanism produces it anyway.** The API cannot
migrate a workspace to a version it holds no migration for, and minting at its own version would
hand a newer client a database missing the columns it is about to write to — the same divergence
the refusal exists to stop, arriving from the other side. It is retryable, because the deploy
carrying those migrations is what ends it.

**The mint migrates up to the *client's* version and no further, where the sweep migrates to the
API's.** Decision 06's sentence about applying "whatever migrations are missing" reads against
the API's target, and taking a workspace there at a mint would refuse the very client that just
paid for it — an API is deployed before its clients update, so the target is routinely ahead of
whoever is asking. So the target is a **ceiling** at the mint and a **destination** in the sweep,
and the sweep taking a workspace past a client is not a side effect: it is what a deadline means,
and it is why nothing runs it automatically.

**Where the client's number comes from is a build, not a memory.** It is the count of `.sql` files
in `packages/workspace-migrations`, derived on each side from that one directory: counted at
runtime by the API, and counted into the desktop binary by `tauri/build.rs`. A migration generated
moves it and nothing else can.

***`packages/workspace-migrations` exists as of this ticket's review, and it discharges the
monorepo effort's removal condition.*** That spec deferred extracting the schema with a condition
written into it — *"the schema is extracted into its own package the moment a second consumer
exists"* — and named decisions 03 and 05 as what would produce one. **Decision 03 answered for
the control plane's *own* schema, which is a different description and rightly stayed separate.
The *workspace* schema is the question it did not answer, and decision 06 produced its second
consumer**: a hosted workspace's migrations are applied by the API, and they are the same
migrations the desktop applies to a local one.

**The first commit copied them into `apps/control-plane/` instead, and both halves of its
reasoning were wrong.** The copy was to be held identical by a test — but the test was hashed
only against the control plane's own files, so the commit that broke it (a desktop migration
added, the copy forgotten) would not have run it: green, and then a desktop at version 5 against
an API target of 4, which refuses **every** client until somebody notices. And the reason given
for copying — that this package's boundary test forbids reaching for a workspace package — was
false on its face: the clause banned every `@rentable/` specifier rather than the desktop
application, and it is this package's own test, one line the same commit was free to narrow. It
is narrowed now to permit exactly `@rentable/workspace-migrations`, which carries no module and no
row and so threatens nothing acceptance criterion 5 rests on.

**What holds the arrangement together is where each guard is hashed.** `turbo.json` now names the
package in the `inputs` of both the control plane's `test` and the desktop's `test:rust`, so a
change to a migration re-runs the tests that read it — which is the property the copy's guard
never had. `apps/desktop/tauri/migrations/` remains, generated by `tauri/build.rs` from the
package and gitignored, because the Rust runner takes a directory, Tauri bundles one, and the
`#542` harness resolves one from `CARGO_MANIFEST_DIR` — none of which could follow the migrations
into a package without changing a harness this criterion requires to pass **unchanged**.

**A hosted database carries the same `__migrations__` ledger a local one carries**, written as
`apps/desktop/tauri/src/database/migrations.rs` writes it. Not tidiness: a replica reaches
machines whose Rust runner decides what to apply by reading exactly that table, and a hosted
database with no ledger would have it start at `0000` and fail on a table that already exists —
a working replica broken by the thing meant to prepare it. **The record's `schema_version` is
this database's index of that ledger and is written from it**, never from what a client asked
for, so a migration that fails part-way is recorded as where it actually got to.

**A workspace is created at version 0 and no client may ask for it.** The mint's floor is 1, which
is the smallest version any build can produce — so the first token on a workspace is always
preceded by a migration, and a full-access token never exists for a database with no tables in it.
A client holding one would have nothing to sync and every reason to build the schema itself, which
is decision 06's rejected option B arriving through the one door that would have been left open.

~~**A local workspace's migrations did not move**, which acceptance criterion 12 holds this to in
as many words.~~ **Superseded 2026-08-19.** The fact recorded here — that #557 left
`database/migrations.rs` untouched and the #542 harness passing, verified against a tree with
`tauri/migrations/` deleted and restored by `build.rs` — was true when it was written and is worth
keeping as a record of what that ticket did. **What it asserts about the future is not**:
requirement 11 retires the client's migration runner entirely, so `database/migrations.rs` leaves
the startup path and `tauri/migrations/` survives only as `build.rs`'s input.

**Permissions are one `INTEGER` column capped at bits 0–52**, per decision 04, and they live on
the membership row in the control plane. That decision was taken against the domain schema's
transports; it applies unchanged here, and the control plane is where it was always going to
land.

# Technical Approach

*Rewritten 2026-08-19 by [[skills/plan]] for the Rust-layer engine. The version this replaces
planned one slice — requirement 16's identity migration — and **that slice is built and landed at
`4bc35646`**: twelve columns converted, a UUIDv7 generator on the client, 18 insert sites
supplying an id, and `0003_serious_synch.sql` carrying it. Its inventory is not restated here;
the code is the record.*

## Where the engine sits, and what `Database` becomes

**`Database` holds one engine at a time.** *Chosen by the human 2026-08-19 over a boxed trait and
over layering `sqlx` on turso's C-ABI shim; decision 10 carries both alternatives and why they
lost.*

```rust
pub enum Engine {
    Local(Pool<Sqlite>),
    Workspace(turso::sync::Database),
}
```

`Database` currently holds `pool: Option<Pool<Sqlite>>` (`tauri/src/database/mod.rs:25`). It
becomes `engine: Option<Engine>`, and **every method that reaches for the pool has to answer for
the second arm** — which is the property this shape was chosen for. `create_backup`,
`restore_backup`, `is_ready`, `execute_single_sql` and `execute_batch_sql` all take a pool today,
and Rust's exhaustive matching is what makes forgetting one a compile error rather than a runtime
surprise.

**Why `Local` survives at all, when there is no local-of-record workspace.** It does not serve a
user's workspace. It is retained for the seeded and test paths, and for the copier under decision
12 — which needs to read an ordinary SQLite file and write through the engine **at the same time,
to two different files**. That is allowed: the prohibition is on two engines holding *one file*,
not on two engines existing. If no such caller survives review, the enum collapses to a struct and
that is a simplification to take, not a design to preserve.

## `connect()` stops running migrations

Today `connect()` opens the pool and then calls `migrations::run(&pool, &migration_dir)`
unconditionally (`mod.rs:59`). **Under requirement 11 it runs nothing.** The control plane applies
the schema at the token mint (decision 06) and the replica receives it as replicated pages.

What replaces it in the `Workspace` arm:

1. read the workspace record and the session from `RemoteSyncStore`;
2. build the engine with `bootstrap_if_empty(false)`, the remote URL **as a function** answering
   `None` until a workspace is known, and `with_auth_token_fn` resolving the current token per
   request;
3. **do not block on a pull.** The replica opens and serves reads and writes whether or not the
   remote is reachable — that is requirement 7, and it is the property `bootstrap_if_empty(false)`
   buys.

**`install_crypto_provider()` must have run before the engine's first request.** It is already
idempotent and already called from each construction site in `src/http.rs`; the engine's builder
becomes one more such site. Getting this wrong presents as a **hang**, not an error.

**`tauri/migrations/` stays in the tree** and is read only by `build.rs`, which counts it to
produce `WORKSPACE_SCHEMA_VERSION` (`tauri/src/database/version.rs`). Its two tests still hold and
should be kept: they catch a build that did not re-run when a migration was added, which would have
the client tell the control plane it was built against a schema it was not.

## The proxy grows a second mapping, and the two must agree

`proxy.rs` decodes **by the storage class a value carries, never by its declared column type** —
`value_at` matches `INTEGER`, `REAL`, `TEXT`, `BLOB` and **errors on anything else rather than
falling back to null**, because that fallback is what let #287 ship silently. The turso mapping
must reproduce all three properties: storage class not declared type, null matched first, and no
silent fallback.

**This is the sharpest cost of the two-variant shape and it is named rather than mitigated.** Two
mappings that must agree, with nothing forcing them to, and the TypeScript test suite exercises
*neither* — `memory.ts` is a third transport that never crosses the language boundary. **The
mitigation is a Rust test that runs one statement set through both arms and asserts identical
`SQLRow` output**, and it belongs in the testing strategy rather than in a reviewer's memory.

**`execute_batch_sql` needs an answer that is not yet established.** It opens an `sqlx` transaction
and runs the batch inside it (`proxy.rs:112`), and `execute_single_sql` explicitly refuses
`BEGIN`/`COMMIT`/`ROLLBACK` so that batching is the only transactional path. Whether the turso
connection offers equivalent semantics — and whether a transaction's writes are captured as CDC
rows and pushed as one unit — **is not in the research and is not inferable from it**. It is the
first thing to establish when this is built, and #536's whole-workspace import makes it
load-bearing: that import is a single batch of roughly six and a half thousand statements.

## The session gains its second window

`apps/control-plane/src/session/session.ts` implements the three-day window as **purely sliding**,
renewed by any reach with nothing capping the renewals. Requirement 15 adds an absolute lifetime:

- one column on the session row, set at sign-in, **never moved by a renewal**;
- the renewal route compares against it and refuses past it with a **typed** answer distinguishable
  from an expired refresh window, because the two demand different things of the user — one is
  satisfied by reconnecting, the other by a real Google re-login;
- the desktop already carries two moments and believes the earlier (`tauri/src/sync/control.rs`,
  `expires_at` and `replica_expires_at`). The absolute lifetime is a **third**, and the "believe
  the earliest" rule extends to it unchanged.

**The lock is a gate, not a sign-out.** Past the refresh window the application locks behind the
login page; when a network returns and the absolute lifetime is still open, the refresh happens
**with no typing**. A build that makes the user re-authenticate on every reconnect fails acceptance
criterion 16 and is the likeliest way to get this wrong.

**No write is discarded to produce either lock** — also criterion 16. Unsynced work sits in the
replica and pushes when replication resumes.

## What is deleted, and the order matters

1. **Drive sync** (decision 07) — `tauri/src/sync/google/**` and `src/lib/sync/**`. The **Drive
   OAuth scopes go with it and the sign-in scopes stay**; that is the concrete obligation under
   *Risks*.
2. **The mode discriminator** — the enum and nine branch sites.
3. **The backup surface** — 1,899 lines plus its user surfaces. **This one is gated**: requirement
   17 and criterion 18 require the updater's protected snapshot and `startup-recovery.svelte` to
   have answers first. *Deleting it is easy and deleting the guarantees underneath it looks
   identical, which is why it is last.*

## What is not established, and where each is closed

| Unknown | How it closes | Blocks |
| --- | --- | --- |
| turso's transaction and batch semantics, and whether a transaction pushes as a unit | read the crate, then a Rust test issuing #536's import shape | the batch transport |
| whether Turso Cloud speaks the MVCC protocol | one request against a real database; `apps/desktop/.env` has the credentials | **nothing** — the one-file rule makes it moot |
| push, pull, conflict, rotation and reconcile **through the Rust API** | acceptance criterion 9's kept test | trusting decision 11's numbers |
| whether `turso_core`'s SQL dialect covers this schema | run the four migrations through a turso connection | the control plane's runner, not the client |
| macOS and Linux builds with `turso/sync` and `sqlx` together | build them | release |

**The first row is the one to take first.** It is cheap, it is answerable from the crate source
before any live account is involved, and it decides the shape of the batch transport rather than a
detail inside it.

# Migration

> **Invalidated for four hours on 2026-08-18, and restored in full the same day.** This section
> carried a banner saying no data had to survive this change and nothing had to be rewritten in
> place. That followed from the installed base being withdrawn, and it was wrong — not about
> the installed base, but about what makes a migration owed. **Acceptance criterion 1 requires
> a populated pre-effort workspace to open, with the same data, on the release that carries
> requirement 16.** So the migration runs over populated rows and remaps every reference,
> whether or not anyone but the person running the criterion ever sees it. *Directed by the
> human 2026-08-18, from three options, at the widest of them: write it in full, backup step
> included.*
>
> **The record is left here rather than tidied because the mistake is instructive.** A
> withdrawn premise looks like it cancels everything downstream of it, and it does not — the
> obligations below were never owed *only* to an installed base, they were owed to the promise
> that data survives an update. That promise outlived the population it was written for.

**The migration this effort must survive is not one it performs.** It is the updater delivering
a new version to a machine holding a populated workspace whose owner made no choice about
architecture. *Restated 2026-08-18: that machine is no longer a stranger's, it is criterion 1's
test machine — and the obligations are identical, because the criterion was written to stand in
for the stranger rather than to be easier than one.*

Part of it is still safe structurally: `RemoteSyncProvider::Local` is the serde default *and* the
existing value, so a persisted store written by `v0.12.0` deserializes into the new enum
untouched. `Database::FILENAME` stays `"app.db"` and `RemoteSyncState.workspace` stays singular,
both by *Out of Scope*.

**But "no data migration runs" is no longer true, and it was the load-bearing sentence here.**
*Corrected 2026-08-18.* Requirement 16 applies one identity scheme to both modes, so **a real
data migration runs on every machine that takes this update** — rewriting the primary key of
every row in a populated workspace, unattended.

**And at least one such machine exists on purpose.** The population is empty, so the honest
reading is that this migration is written for a test rather than for users. That does not
reduce a single obligation below it: a migration correct only under observation is not correct,
and the criterion exists precisely because nobody will be watching the second time.

What holds it together, and each of these is an obligation on whoever builds it rather than a
description of something that exists:

- ~~**It is Rust's, like every other migration a local workspace has.**~~ **Reassigned
  2026-08-19.** It was written and landed as Rust's, at `4bc35646`; requirement 11 then moved every
  workspace schema to the control plane's runner. `0003_serious_synch.sql` lives in
  `packages/workspace-migrations/` and is applied there. **Every obligation below still binds —
  they are properties of the migration, not of which runner applies it.**
- **It runs in one transaction.** A workspace is fully migrated or untouched; there is no
  third state, which is what acceptance criterion 1's interruption case checks.
- **The mapping is built once and applied everywhere.** Old id to new UUIDv7, per concept, then
  applied to the records, to `contract_unit` on both columns, to `payment.contractId`, and to
  `history.recordId`. **History has no foreign key to violate**, so nothing would catch it being
  missed — it is listed last here and first in the criterion for that reason.
- **The old file is not the safety net** — and **the application already builds the net.**
  *Corrected 2026-08-18 by [[skills/tasks]], reading the tree.* This bullet said the backup was
  work to be built, and the plan written earlier the same day named `create_backup_from_pool` as
  where it would hook. **Both were wrong, and they were wrong in the direction that costs most:
  they would have added a second backup mechanism beside one that already does the job.**

  What exists: `update.rs`'s `prepare_update` creates a **protected** snapshot —
  `BackupSource::Recovery` with `BackupRecoveryKind::Update` — and
  `settings/component/updates.svelte:107` awaits it **before** `downloadAndInstall`. So the copy
  is taken before the new version is installed, and therefore before the migration ever runs. On
  success `complete()` releases the protection and ordinary retention keeps the last
  `UPDATE_RECOVERY_RETENTION_LIMIT` = **3**, so the pre-migration workspace survives roughly
  three update generations and is restorable through the recovery path already built for it.

  **So no backup ticket is cut**, decided by the human 2026-08-18 over a narrower ticket and
  over building it anyway. The obligation as this section words it — *a user who takes an update
  does not have a copy of what they had before it* — is exactly what that mechanism provides.

  **The one path it does not cover is an install that bypasses the in-app updater**, which is
  how acceptance criterion 1 was rehearsed: the run drove `msiexec` on the artifact directly, so
  no snapshot was taken. That run is manual and its operator can copy the file by hand, which is
  why it does not justify a second mechanism — **but it is the reason criterion 1's backup check
  is worded against the snapshot the updater takes rather than against any file on disk.**

  *This is the second plan-level statement in one day that the tree contradicted, after the
  claim that the design primitives' `{ id: number }` constraint was architectural. Both were
  written from the spec rather than from the source, and both were caught by reading it. The
  identity ticket has no seam either way: schema, migration and every call site fail to build
  unless they move together, which is why it stays one ticket however large it reads.*

*Why this is stated at length: the previous version of this section said no migration ran, and a
reader who skims it would carry that belief into the build. The sentence is struck rather than
edited quietly.*

~~A local workspace's migrations stay Rust's, exactly as now.~~ **Struck 2026-08-19 with
local-of-record.** Requirement 11 puts every workspace schema on the control plane, and the
client's runner leaves the startup path.

~~The local-to-hosted conversion is decision 12's and is not planned here.~~ **There is no
conversion.** Decision 12's copier survives as the mechanism for seeding a workspace database from
existing rows, and that decision says why it is still the only safe one.

**Where this section now stands, 2026-08-19.** The identity migration it plans is **built and
landed at `4bc35646`**, and with one record of truth it runs against a database the control plane
created moments earlier rather than over a populated workspace. So the obligations above are
discharged rather than pending — with one exception worth carrying forward, because it is the only
one that was never about the data: **the identity change must remain one file**, since the
all-or-nothing guarantee is a property of one file and nothing warns when it is split.

# Testing Strategy

*Rewritten 2026-08-19 against the criteria as they now stand. The version this replaces was built
around a two-mode world and its central mitigation — run the local-mode criteria early so the mode
nobody is excited to build does not rot — **is discharged by the mode being removed**.*

| AC | Checked by |
| --- | --- |
| 1 | **Manual, unavoidably so, and not met.** A signed-in install, updated through the real updater, reopening its workspace with no login page. Rehearsed 2026-08-18 on `v0.12.0` → `v0.13.0`, which proved the procedure and not the criterion. The plugin's own check-download-relaunch is still unexercised |
| 2 | A search of the tree for a workspace list, a switcher, or the `provider` discriminator, all returning nothing; plus `RemoteSyncState.workspace` still singular and `Database::FILENAME` still `"app.db"` |
| 3 | A clean-install run reaching sign-in and nothing else. Partly automatable — that no surface renders workspace data before an account exists is a routing assertion; that the application *feels* like a wall is not |
| 4, 5 | Two installations and one account, manual. 5 is the one that cannot be faked: a workspace created on A, present with its data on B, with no file copied |
| 6 | After a first sign-up: one workspace database for the account, every declared table present, **every primary and foreign key `TEXT`**, no `idmap` surviving, and the client's `WORKSPACE_SCHEMA_VERSION` equal to the version recorded against the workspace. Automatable end to end against a live account, and it is the criterion that replaced the conversion one |
| 7, 8 | Network disconnected, against a replica: every surface renders, and a payment records. 8's second half — present on the second device after both reconnect — needs two installations |
| 9 | **A kept Rust test**, not a prototype. Two replicas, separate directories, both disconnected, both pushed; assert the loss is per column and that a row deleted under a concurrent edit goes whole. *The finding it must reproduce is known in advance — decision 11 measured it through the npm binding — so this test converts an inference into an observation* |
| 10 | A search of the tree finding one database client type, and the existing router tests still passing over `createMemoryDatabase()` **unchanged** — the second being the real check, since it is what a forked client type would break |
| 11 | `src/lib/api/tests/context.test.ts`, covering identity present on every request. **The existing test asserts the opposite** — a request carrying none — so this criterion is met by changing that test, and a run that leaves it untouched has not met it |
| 12 | The mint's migrate-then-issue path exercised end to end against a live account, plus an older client receiving the typed refusal and issuing no write. **The client half is now a tree search**: no migration runner on the startup path, and `tauri/migrations/` read only by `build.rs` |
| 13 | Two installations, one account, one route: a workspace reaching the second through Turso. Plus a search finding no Drive code and **no Drive OAuth scope** |
| 14 | A search for "there is no server" returning only text that is still true when read. Decision 09 owns the rewriting; this is how the result is checked |
| 15 | Decision 09's written sketch existing, and naming nothing that would have to be unpicked |
| 16 | **Two clock tests, not one.** Advance past three days with no reach: locked. Reconnect inside the month: **unlocked with no typing** — that assertion is the one most likely to be missing, and its absence is indistinguishable from a pass. Advance past one month while reaching daily: a real re-login. And in every case, no write made during the window is discarded. `Clock` is already injected at `src/lib/api/context.ts:36`, so no new seam is needed |
| 17 | Two clients, separate directories, both disconnected, each creating records the other has never seen, both synced — then a count per concept, `history` included. **Written first as a failing test against the rowid schema**, so the collision is demonstrated before it is fixed |
| 18 | A search finding no `tauri/src/backup/`, no manifest, no backup surface in settings or i18n — **and** a positive demonstration that whatever replaced the updater's protected snapshot works. The search half is easy and proves the deletion happened; the demonstration half is the criterion |

**Three criteria cannot be automated at all** — 1 entirely, 4 and 5 in their two-machine halves —
and the tree searches in 2, 10, 13, 14 and 18 only ever prove that something is *absent*. They are
named so a green suite is not mistaken for a met spec.

## The two engines need a test that nothing else will produce

*Added 2026-08-19, and it is the one test this plan owes that no criterion asks for.*

`proxy.rs` will carry **two row mappings** — one over `sqlx`, one over `turso` — that must agree on
every storage class, on nulls, and on refusing to fall back. Nothing forces them to agree:
the TypeScript suite exercises neither, because `memory.ts` is a third transport that never crosses
the language boundary, and the criteria are all about behaviour a user can see.

**The test is a Rust test that runs one statement set through both arms and asserts identical
`SQLRow` output**, over every class `value_at` names — `INTEGER`, `REAL`, `TEXT`, `BLOB` — plus a
null, plus an aggregate expression with no declared column type. That last one is not decoration:
it is #287, where a numeric aggregate arrived as null because the declared type was consulted
instead of the storage class, and it is the specific bug a second mapping is most likely to
reintroduce.

## What became of the Rust migration harness

*Found 2026-08-18: `database/migrations.rs` and `database/mod.rs` contain no tests at all, so
criterion 12's local half had never been runnable. It was written up here as work this effort
owed.*

**It is no longer owed on the client, and the obligation moved rather than vanished.** Requirement
11 puts migration ownership entirely on the control plane, so the runner that needs a harness is
that one. The checks the harness was specified to make survive the move almost unchanged — apply
the real files through the real runner; assert every generated id matches the UUIDv7 grammar
`[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`; assert the identity change
is **one file**, because the all-or-nothing guarantee is a property of one file and not of a
migration; and assert migrated rows come back in the order their rowids had, because
`contract/router.ts:789` sorts a user-facing search by id alone and a regression there is invisible
in every other query.

**What drops away with the populated workspace** is the count-per-concept and
reference-resolution half: there are no rows to carry across, so those assertions would compare an
empty database to itself. Criterion 6 checks the schema the migration produces instead, which is
what is actually at stake now.

**The lesson is kept because it outlived its subject.** A criterion read for four days as though
its cheap half were already covered by tests that had never existed — the shape this spec has now
caught five times, and the reason every row in the table above names a mechanism rather than an
intention.

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

**The partial architecture cuts *some* tickets — reversed by the human, 2026-08-18.** This
paragraph used to say it cut none, and that the gate-free half would wait. The effort stays
**one effort** rather than splitting, and the half that does not wait on decision 11 is cut into
work now. *Why the reversal: the spec's own Testing Strategy says every gate-free criterion is
runnable today "before a line of hosted code exists", and the risk it names — local-of-record
rotting into a path that compiles and is never exercised — is paid by waiting, not by building.*

**The old reasoning was right about two items and wrong as a general claim.** [[rules/tracker]]'s
test is whether work produces **a branch that lands as one unit of review** — not whether the
outcome is visible to a user. Applying that test item by item, and this is what
[[skills/tasks]] inherits rather than re-derives:

| Gate-free item | Branch-shaped? |
| --- | --- |
| **Decision 08's `Host` inversion** — declare the interface, have the Tauri facade satisfy it | **Yes.** A real diff at `src/lib/api/context.ts:27`, decided already, and the compiler holds it honest. The clearest ticket on this effort today |
| **Separating authentication from Drive sync** | **Probably** — 08 established it is needed whichever way 07 and 11 land, since sign-in is Google and the OAuth half survives regardless. It sits inside decision 07's territory, so `/tasks` confirms rather than assumes |
| ~~**The `Hosted` enum variant and its seven call sites**~~ | **Inverted 2026-08-19.** The judgement was right and its subject is gone: with one record of truth the variant is never added, and **the enum is deleted instead**. Deletion *is* branch-shaped — it needs no gate, constructs nothing, and the compiler finds every site. It moves from *waits on the gate* to *ready*, and the count is not seven ([[#Components]]) |
| **The optional identity member on `Context`** | **Inverted 2026-08-19, for the same reason.** It was "no" because a test covering a request carrying identity could not be written while nothing could carry any. Requirement 10 makes identity **required**, so the work is making the existing optional member mandatory and rewriting the test that asserts the opposite — a real diff, gated on nothing |
| **Decision 09's rule re-scoping** | **Changed shape 2026-08-19.** "Scoping a rule to local workspaces" is no longer one of the available answers (requirement 13), so what is left is supersede-or-defend, which needs no gate. Still not first — it is best done after the deletions, so the rules are rewritten against the tree that exists rather than the one being removed |
| **Acceptance criterion 1** — the real updater against a populated install | **Not a ticket at all** — it produces no branch, so under [[rules/tracker]] it is a verification rather than work. **Rehearsed 2026-08-18 and still open**: the run used a release pair predating this effort, so it proved the procedure and not the criterion. It is no longer runnable today — it waits on this effort having a release. The result is recorded at the criterion itself, there being no `evidence/` kind for a criterion run ([[protocol]] declares exactly `research` and `prototypes`) |

So the frontier is small and it is not empty, which is the point.

**The gate ran on 2026-08-18 and came back a go, which reopens three rows of that table.**
The `Hosted` variant, the optional identity member on `Context`, and decision 09's rule
re-scoping were all marked *waits on the gate*; nothing waits on it now. The reasoning above
is left standing rather than rewritten, because it was right when it was written and the
record of why is worth more than a table that reads as though the answer was always known.
**Deciding what those become is [[skills/tasks]]'s, not this section's** — and one of them
grew: the identity migration decision 13 settled is now the largest piece of work on this
effort, and requirement 1 is what makes it risky rather than merely large.

**Accepting does not make requirement 7 achievable.** It is hard, decision 11 is a go/no-go, and
a negative result ends the hosted half of this effort. If that happens the spec is changed
deliberately under [[policies/execution]] rather than quietly relaxed — the requirement is what
would be renegotiated, in the open, and the local-mode half stands either way.

**The last four were taken under a standing instruction, and that is recorded rather than
disguised** *(2026-08-18)*. [[protocol]]'s *Humans decide* forbids choosing silently between two
reasonable architectures; it does not forbid the human delegating a batch of them, which is what
happened here — the direction was to work the effort to its end without interruption and, where a
decision was needed, to take the recommended one. So 06, 07, 09 and 12 each carry a
**recommendation argued in full with its rejected alternatives named**, and each was then taken.
**Every one of them is reversible by reading its own reasoning and disagreeing with it**, which is
the property that makes a delegated decision different from an assumed one. Where a decision would
have changed the *product* rather than its construction it is flagged at the decision itself —
decision 07 is the only one of the four that does, and it is flagged there.

**And 07 was in fact reversed, within the day** — the human dropped Drive sync in favour of Turso
sync. **That is the flag working rather than the delegation failing**, and it is recorded here as
well as at the decision because it is the evidence for how much weight the other three should
carry: the one that changed the product came back, and the three that changed only its
construction did not.

Worked one per session, except research, which runs alongside. Resolving one means writing the
answer here and appending one line to the map's **Decisions so far**;
[#497](https://github.com/saud-alnasser/rentable/issues/497) gists and links, and nothing here
is mirrored back onto it.

Decision 02 has moved to [[efforts/the-repository-becomes-a-monorepo/spec]] and keeps its
number there. It is **decided** — a minimal workspace, `apps/desktop/`, no `packages/` yet — so
decision 08 is no longer blocked.

**Two things reshaped these questions on 2026-08-17**, after most of them were written, and each
affected section says so at its head: local workspaces stay first-class, so every question below
answers for **two modes**; and ~~the installed base is real, so *what happens to what already
exists* is a requirement rather than a footnote~~ — **the second half is struck 2026-08-18.**
There is no installed base, and *what happens to what already exists* is a question about a
developer's seeded database. **Two modes survive that unchanged**, confirmed by the human on
the same day: they were never held up by the installed base alone.

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

- **Transactions survive (02, [[rules/data]], under *Multi-table writes*).** A batch stays atomic on every
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
  which prices the unbounded reads of *List reads* in [[rules/data]] directly — and sync bills 4 kB frames even
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

## 10 — grilling(persistence): which client, and where the engine runs

Status: **reopened and re-decided 2026-08-19 — the `turso` Rust crate, version 0.8.0-pre.4, with
the non-default `sync` feature.** *Directed by the human: the sync engine moves into the Rust
layer. The version was chosen by the human from the two the research put on the table.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 01 (resolved)

**What this decision used to say, and why it stopped being true.** It chose
**`@tursodatabase/sync`** — the npm package — as a JavaScript client driven from
`src/lib/platform/database/`. Decision 11 validated that choice against a live account on
2026-08-18 and it passed every question.

**It cannot run here.** The package is a **native NAPI addon**: its entry reaches `node:fs`
through `createRequire`. This frontend is `adapter-static` inside a WebView2 with **no Node**.
The failure is not a build error — referencing it from `client.ts` **builds successfully**,
emitting raw source with bare specifiers — so it would have shipped and failed the first time a
workspace opened. #548 built exactly that and its commit is invalid for this reason.

**The engine choice never changed.** It is the same engine, at the same version number, that
decision 11 measured. What changed is which side of the Tauri boundary it runs on, and therefore
which artifact delivers it.

### The options, as they stood on 2026-08-19

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — the `turso` crate in Rust** *(chosen)* | Coexists with `sqlx` — **demonstrated, not inferred**: both link into one binary and run, reporting SQLite 3.51.3 and 3.50.4 from one process. Deferred open and token rotation are **named builder methods** with in-crate tests, where JavaScript had a callback convention. Credentials never cross IPC, which is where [[rules/credentials]] already puts them | Two row mappings in `proxy.rs` that must agree, with nothing forcing them to. +154 crates. `simsimd` is a non-optional C dependency of `turso_core` on every desktop target | Every one of decision 11's measurements was taken through the NAPI binding; none has been re-run through the Rust API. Same engine, so they are expected to carry — **inference, not observation** | One more arm on every method of `Database` |
| **B — `@tursodatabase/sync-wasm`** | Published, identical surface, one import specifier different. Runs in the WebView with no Node | **Moves where the replica's files live**, away from the `localDatabasePath` Rust owns — and the engine writes six sidecars beside the database. Credentials would cross IPC into the web layer | Puts the record of truth inside a WebView's storage, which is not a place this repository has ever kept one | A second place files live, forever |
| **C — a Node sidecar** | Runs the validated npm package unchanged, so decision 11's evidence carries exactly | A third process to ship, supervise, and **sign per platform**. Doubles the installer's moving parts | A supervised child process is a whole class of failure this application does not currently have | Highest of the three |
| **D — `sqlx` on turso's C-ABI shim** | Dissolves the two-engine problem entirely: one engine, one file, one mapping | The enabling symbols are **no-op stubs** (`update_hook`, `commit_hook`, `rollback_hook` return NULL). `PRAGMA foreign_keys` is **intercepted and answered with `SELECT 1`** rather than enforced — its own author flags it temporary. The shim is **not published on crates.io** | Foreign keys answered rather than enforced, on a payments ledger | Building a cdylib out of the vendor's repository |

**Chosen: A**, by the human. **D is the one worth naming hardest**, because it is the shape that
would make everything else simpler and it is the one a later reader will re-propose: the research
surfaced it and explicitly declined to rank it. It loses on foreign keys, and on a payments ledger
that is not a detail.

### The version, and it is a real choice rather than a formality

**`0.8.0-pre.4` (2026-08-11), chosen over `0.7.2` (2026-07-30), the max stable.**

`0.7.2` predates PR [#8103](https://github.com/tursodatabase/turso/pull/8103), merged 2026-08-07:
*"A crash before the first checkpoint used to leave the main database file empty (0 bytes) while
every committed, fsync-acknowledged transaction — including page 1 itself — lived only in the
-wal… **The whole first WAL epoch was silently lost** and `PRAGMA integrity_check` reported ok
against the blank image."* The research's own offline probe ended in exactly that state: main file
0 bytes, 45 kB of committed writes in the WAL.

**So the trade is a known pre-release against a known silent-data-loss window**, and it was taken
towards the pre-release. Its sync API was read at 0.8.0-pre.4 and differs from 0.7.2 only in
`IoBackend` / `page_codec` / `open_flags` config fields and test-harness changes — **but it was not
built**, and *Risks* carries that.

**Features: `default-features = false, features = ["sync"]`.** Not a style preference. Default
features install `mimalloc` as the **global allocator for the whole Tauri process**
(`turso/src/lib.rs:35–37`) and pull `tantivy` in through `fts`. Turning them off drops both,
confirmed by lockfile inspection.

### What is no longer live under this decision

**Option C of the original four — offline reads only — stays rejected**, and its rejection is now
structural rather than a choice: requirement 7 is hard, and there is no local mode left to carry
offline writes on its behalf. **The legacy `libsql` crate is excluded by evidence**: it fails
outright beside `sqlx` with **292 multiply-defined `sqlite3_*` symbols, LNK1169** — demonstrated by
building a binary, not inferred. `turso_core` is a pure-Rust rewrite, links no C SQLite, declares
no `links` key, and appears nowhere near `libsqlite3-sys`.

**Removal condition.** If the C-ABI shim is published to crates.io and enforces foreign keys, option
D becomes strictly better than A and this decision should be re-read: it would collapse two mappings
into one and remove the one-file constraint that *Architecture* is built around.

## 11 — prototype(persistence): confirm the chosen client against a live database

Status: **the gate ran 2026-08-18 against a live account and it is a GO. Amended 2026-08-19: the
client it validated is not the client that ships.** Every measurement below was taken through the
`@tursodatabase/sync` NAPI binding at 0.7.2; the application now runs the `turso` Rust crate.
Part of: a-workspace-follows-its-user
Type: prototype
Blocked by: 10 (decided)

Evidence:
[[efforts/a-workspace-follows-its-user/evidence/prototypes/turso-sync-against-a-live-database]]
and, for the Rust half,
[[efforts/a-workspace-follows-its-user/evidence/research/turso-sync-in-the-rust-layer]].

**Requirement 7 is met.** A replica accepts writes with no network and pushes them when the network
returns. Nothing found here ends the effort.

### What it settled, and what each is worth now

| # | What it established | Carries to Rust? |
| --- | --- | --- |
| 1 | A `libsql://` database created through the Platform API is a valid sync target | **Yes, by construction.** `normalize_base_url` maps `libsql://` and `turso://` to `https://` and has a unit test asserting it |
| 2a | Contended loss is **per column**, not per statement or row; a row deleted under a concurrent edit goes whole with no error either side | **Expected, not observed.** Server-side behaviour, same engine — but no conflict has been driven through the Rust API |
| 2b | Two disconnected replicas creating unrelated records collide on the primary key, silently, and one payment is simply gone — while client-assigned `TEXT` keys keep both | **Closed at the schema**, not at the client. `4bc35646` |
| 3 | An offline first launch works **only** where `url` is a function rather than a string | **Yes, and better.** Rust names it `bootstrap_if_empty(false)` — a builder method with an in-crate test, verified against a non-routable remote |
| 5 | Rotating the auth token costs **63 bytes**, identical to not rotating | **Yes, and better.** `with_auth_token_fn` is documented as resolved before every request, with two tests |
| 6 | The reconcile pass sends **zero bytes**, followed by one batched push | **Expected, not observed** |

**So the three questions the credential model and the offline story rest on — 1, 3 and 5 — are
*stronger* in Rust than in JavaScript**, because what was a convention is a named API with tests
behind it. The two that are weaker are the two that were *measurements*: 2a and 6.

**What this costs, stated plainly.** The gate is believed to have passed for a client nobody ran it
against. It is recorded in *Risks*, and **acceptance criterion 9's kept test is what discharges
it** — that criterion already demands a kept test rather than a deleted prototype, and it is now a
Rust test whose expected finding is known in advance.

### Question 4, answered without an account, and it still matters

*Resolved 2026-08-17 by reading package source at named versions.* In `libsql-js` 0.5.29 / Rust
`libsql` 0.9.30, the `offline: true` branch **silently drops `syncInterval` and
`encryption_config`**, and `PushStatus::Conflict` returns `SyncError::InvalidPushFrameConflict`
with **no library-provided recovery path**.

**It is worth keeping now that the fallback it priced is gone**, because the Rust crate has the
same shape and it is worse: `Error::DatabaseSyncEngineConflict` is constructed in exactly one place
and **handled nowhere** — three hits in the whole crate, being the declaration, the doc comment and
the construction — and it is then **flattened on the way out**, every sync-engine failure mapped to
one string in `turso_async_operation.rs:217–221`. `turso::Error` has variants for `Busy`,
`Constraint`, `Readonly`, `Corrupt` and `NotAdb`, and **none for conflict**.

**A caller cannot distinguish a push conflict from a network failure except by matching the
substring `"database sync engine conflict"`.** That is a constraint on how push failures are
reported to a user, and it is written here so it is not discovered at the surface.

### What the run needed, kept because it is still how the next one runs

Two values in **`apps/desktop/.env`**, which is gitignored: `TURSO_API_TOKEN` — a **Platform API**
token, not a database token — and `TURSO_ORG`. Both are present today, which is why the remaining
live questions are cheap rather than blocked.

### What is still not established

- **turso's transaction and batch semantics**, and whether a transaction's writes are captured and
  pushed as one unit. Not in the research and not inferable from it. `execute_batch_sql` runs its
  batch in a transaction and #536's import is a single batch of ~6,500 statements, so this is
  load-bearing. **Answerable from crate source before any account is involved, and it should be
  taken first.**
- **Whether Turso Cloud speaks the MVCC protocol.** One request against a real database. It
  decides whether the replica file stays readable by stock SQLite — and *Architecture*'s one-file
  rule makes it moot, deliberately.
- **macOS and Linux.** Every build and run in the research was x86_64-pc-windows-msvc.
- **Whether `turso_core`'s SQL dialect covers this schema.** The README says compatibility is *"not
  at 100% yet"*; no migration has been run through it. **This lands on the control plane's runner
  rather than the client**, since requirement 11 moved migrations there.

## 03 — grilling(persistence): what a user is, and where the control plane lives

Status: **mostly directed 2026-08-18 — the control plane is built here, as an API.** What remains
open is narrow and is named at the foot of this section.
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — *(was 11; the human directed the shape rather than waiting for the gate)*

**Directed by the human, 2026-08-18:** *"the api is used for sync/backup and for auth"*, and
*"there's an online db for all accounts auth and workspaces association."* So the control plane
is **one always-online database behind an API this repository builds**, holding accounts,
workspace records and membership — not a hosted identity service, and not bought. It also mints
the token a client syncs with, which is what puts it in the credential path without putting it
in the data path (*Architecture*).

**And it answers the monorepo effort's open removal condition.** Its plan defers extracting the
database schema into a package until a second consumer exists, and named this decision as what
would produce one. **It does not**: the control plane describes accounts and membership, not the
domain, so it is a separate description rather than a second consumer. The extraction stays
deferred and its condition stays unfired.

**What is still open here**, and it is now a design question rather than an architectural one:
~~what a user record holds beyond what `RemoteSyncAccount` already carries~~ — *answered
2026-08-18 by #549, and the answer with its cost is in `Data Model`: the identity half of that
type carries over and everything else on it belongs to Drive or to a credential* — what the
session is on the wire, given requirement 15 makes it a token with a lifetime; and what the
client holds while offline so that *signed in three days ago* is something it can prove rather
than a flag it sets about itself.

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
53 usable bits before **silent** precision loss, and [[contexts/desktop/persistence]]'s promise that an
unmappable value fails the query does not cover it, because nothing fails: the value rounds on
the far side. Options include several integer columns, a text or blob representation, a row per
granted permission, or capping the flag set below the ceiling. This is answerable now and does
not wait on 11.

### What was assumed, and what was measured *(2026-08-17)*

The premise above was recorded from reading `tauri/src/database/proxy.rs:66` —
`"INTEGER" => Ok(Value::from(row.try_get::<i64, _>(index)?))`. It was **not** measured, and
[[contexts/desktop/persistence]] is explicit that value conversion is *per-transport*, so the two halves
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
  [[contexts/desktop/persistence]] warns that a router test can pass over a conversion broken in the
  running application. That warning does **not** apply here. A router test over the memory
  transport pins this faithfully, so whatever is chosen below is testable at the cheap tier.
- **The cliff is sharper than "53 usable bits" suggests.** A value using only bits 0–52 is
  exact. The moment bit 53 is set the value passes 2⁵³ and the **low-order** bits round away —
  so *the 54th flag defined silently corrupts the first flags defined*, retroactively, on every
  row already written. That is the worst available shape for a permission field: the failure
  lands on the oldest and most fundamental permissions, on read, with no error.

### A second ceiling, twenty-two bits lower *(found 2026-08-18, building #549)*

Everything above is about **storage**, and it is right. What it does not cover is the
**operators**, and they have a ceiling of their own that is far lower and just as silent.

**JavaScript's bitwise operators coerce their operands to a signed 32-bit integer.** So
`1 << 40` is `256`, `2 ** 52 | 0` is `0`, and `permissions & mask` — the exact expression this
decision's option A is named for — discards every flag above bit 30 without erroring. The
53-bit ceiling this decision chose is unreachable through the operators that made option A look
cheap.

It costs nothing to avoid, which is why this is a note rather than a reopening: **distinct
powers of two sum to exactly what an OR of them produces**, and a single bit reads back as
`Math.floor(permissions / 2 ** bit) % 2`. `apps/control-plane/src/workspace/permission.ts` is written that
way and `permission.test.ts` pins the reason, so the next person to reach for `|` finds a test
saying why it is not there.

**Option A's SQL half is unaffected**, and that is the reason the decision stands: SQLite's `&`
is 64-bit, so `WHERE permissions & 4` — the advantage option A was chosen for — works to the
full 53 bits. Only the JavaScript side needed the arithmetic form.

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
| **C — text or blob** | No ceiling; exact at any width. The proxy maps `TEXT` verbatim (`proxy.rs:68`), so no precision path exists | **Bitwise SQL is gone.** `WHERE permissions & 4` cannot be written against a string, so every check moves into application code over full rows | Pushes filtering to the client, which is the shape [[rules/data]], under *List reads*, reasons against | Parse and serialize on every read and write |
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

Status: **decided 2026-08-18 — the first shape: membership grants full workspace access, and
roles govern administration only.**
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — *(was 11)*

**The decision, so it is not read out of the prose below.** A member of a shared workspace has
full access to its data. Roles govern *administration* — inviting, removing, changing settings —
and not which records a member may read or write. **Fine-grained per-record permissions are not
available to an offline-capable client and this effort stops pretending otherwise.**

*Chosen by the human 2026-08-18, with the cost stated: it is the price of requirement 7 on a
shared workspace.* The reasoning is the question below, unchanged — a client that writes to a
local replica offline holds a credential good for that whole workspace database for the length
of the offline window, so the enforcement point would have to be a server it is by definition
not talking to.

**Routing data through the API would not have rescued it**, which is worth recording because it
is the obvious counter-proposal: it moves the enforcement point onto a server the offline client
still is not talking to. The only shape that makes fine-grained permissions enforceable is
denying shared workspaces an offline replica — put to the human as an option 2026-08-18 and not
taken.

**What removing a member does**, since it follows directly: access ends when their token is next
due for renewal and the API declines it, which is bounded by the token lifetime rather than
immediate. That bound is this repository's to set, and it is the same mechanism requirement 15
runs on.

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

Status: **decided 2026-08-18 — the control-plane API owns a hosted workspace's schema, and the
token mint is where it acts.** *Taken under the standing instruction recorded at the head of this
section, on the recommendation written below.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — *(was 11, decided 2026-08-18)*

**Question.** Rust owns applying migrations today and the TypeScript side never runs them
against the app's database ([[contexts/desktop/persistence]]). With the database hosted and several
client versions able to connect, that ownership has to move somewhere — the API, the client on
connect, or a deploy step — and whichever it is has to answer what an older client does when it
meets a newer schema. That answer is requirement 11, and its check is acceptance criterion 12 —
which also holds this decision to leaving a local workspace's migrations exactly where they are.

**The named owner requirement 11 asks for is the control-plane API.** It is the only party that
knows every workspace database, already holds a credential that reaches each one, and is already
in the credential path continuously and the data path never (*Architecture*). Nothing else on
this map has all three, and the third is what makes this cheap: the API does not have to be put
anywhere new to do the job.

**Where it acts: at the token mint, not at deploy time alone.** A client that wants to sync asks
the API for a workspace token. The API compares the workspace record's schema version against the
version the running API targets, applies whatever migrations are missing to that workspace
database, and only then issues the token. A deploy that ships a migration therefore does not have
to sweep an unbounded and growing set of databases before it is safe — each workspace takes its
migration the next time somebody opens it, and a workspace nobody opens costs nothing. *A sweep
is still available and is kept as a mechanism rather than as the owner: it is how a migration
reaches workspaces ahead of their users, which matters for anything with a deadline.*

**What an older client does, which is requirement 11's second half.** The client sends the schema
version it was built against with its token request, and there are three answers:

- the client's version equals the workspace's — mint;
- the client's version is **newer** — migrate the workspace up to it, then mint. This is the
  ordinary upgrade path and it is why the mint is the right place: the first client to arrive
  after a deploy is the one that pays for the migration, and it is by definition online;
- the client's version is **older** than the workspace's — **refuse, typed**, naming the action:
  update the application. The client shows that message and issues no write, because it never
  received a token.

**Refusing at the mint rather than at the write is the whole of the reasoning.** An older client
allowed to sync would replicate a schema it does not understand and then write against columns it
does not know about; by the time a write fails, its local replica has already diverged and the
divergence is what has to be repaired. Withholding the credential stops it before the first byte,
and it does so through a mechanism this architecture already has rather than a second one built
to answer the same question.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — the API, at the token mint** *(chosen)* | One named owner, and nothing races because one process holds the credential. Migration is lazy per workspace, so cost tracks use. The refusal path for an old client falls out of the mechanism rather than being built beside it | A workspace's first open after a deploy pays for the migration, so that open is slower and needs a network it already needed | The mint is now inside the migration's failure path — a migration that fails leaves a user unable to **sync**, rather than merely unmigrated. Local work continues, which is what makes it survivable | One migration runner in the API and one schema-version column on the workspace record |
| **B — the client applies on connect** | No API work at all; a runner already exists in Rust | **Several client versions racing to apply DDL to one database.** An old client never applies, a new one applies while an old one is live, and the DDL then replicates to every other replica with no coordination | High, and silent | Every client kind reimplements it, including the ones that have no Rust |
| **C — a deploy step sweeping every workspace** | Simple to reason about, and the whole estate sits at one version | Cannot answer for a workspace created after it ran, and the sweep grows without bound | A partial sweep leaves the estate at two versions with nothing recording which is which | An operational procedure rather than code, which is the kind that rots unwatched |

**Chosen: A.** B is disqualified by concurrency rather than by cost — it is the cheapest to build
and the only one that can corrupt a workspace. C is kept as a mechanism inside A and rejected as
the owner.

~~**A local workspace's migrations do not move.** Rust applies them at launch from
`tauri/migrations/`, exactly as today.~~ **Struck 2026-08-19 with local-of-record.** There is no
workspace Rust migrates, so **this decision's ownership is now total rather than partial**: the
control plane owns every workspace schema, and the client applies nothing.

*This makes decision 06 stronger, not weaker.* Its option B — the client applying on connect —
was disqualified for concurrency: several client versions racing to apply DDL to one database. That
hazard is now sharper than when it was written, because **DDL issued through the sync connection is
captured as CDC and replicates**, so a client applying a migration would push schema changes to
every other replica. The research establishes the mechanism; the decision had already ruled it out
on reasoning alone.

**What survives on the client** is `tauri/migrations/` as `build.rs`'s input for
`WORKSPACE_SCHEMA_VERSION` — the number the client sends to the mint, which is this decision's own
mechanism. [[contexts/desktop/persistence]] needs correcting: it describes Rust applying migrations
at launch, and that stops being true.

**What it costs when organizations arrive** *(acceptance criterion 15)*: nothing. A workspace
database is per workspace regardless of how many people are in it, and the mint already runs per
member — the same comparison runs, per member, against the same workspace record.

**Removal condition.** None that this effort can reach. If the data path ever moves through the
API — the shape *Architecture* names and rejects — migration ownership is already where that
shape would want it, and this decision does not have to be revisited.

## 07 — grilling(sync): what becomes of Google Drive sync

Status: **decided 2026-08-18 by the human — Google Drive sync is retired, and Turso sync
replaces it.** *This reverses the recommendation taken under the standing instruction earlier the
same day, which kept Drive scoped to local workspaces. That recommendation is kept in full below,
as a rejected option with its reasoning — it was flagged at the time as the one of the four that
changes what a user is promised, and it is the one the human came back through.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — *(was 11, decided 2026-08-18)*

**Simplified 2026-08-19, and this decision got cheaper rather than reopened.** The retirement
carried one qualification — requirement 12's *"and whatever it becomes still serves local
workspaces"* — and it was the expensive half: it is what made the whole-workspace export the
answer to a question about sync, and what put *"everything since the last export"* into *Risks* as
the price a local user paid. **With local-of-record removed there is no such user**, so retirement
is now unqualified deletion with nothing owed in its place, and the largest loss this decision
recorded is no longer borne by anybody.

**Two obligations survive the simplification, and neither is automatic.** The **Drive OAuth scopes
go when the Drive code does, and the sign-in scopes stay** — an application still asking for Drive
access after deleting Drive is the shape *Risks* names. And #536's export stays in the tree as a
user-facing exchange format, which is what it always was; acceptance criterion 13 explicitly
refuses to accept it as a sync route.

**Question.** A hosted remote of record makes Drive redundant as a sync mechanism while leaving
it plausible as a user-owned backup. Whether it survives, becomes an export path, or is retired
decides the fate of a large and carefully-built Rust surface — the manifest, conflict analysis,
retention, the link session — and of [[rules/credentials]] entire, every section of it —
*Client boundary*, *Concurrency*, and *Transport testing* — and of [[contexts/desktop/remote-sync]] with
it. Requirement 12 is that the answer is executed, not merely reached.

**Constrained again 2026-08-17, from the other side.** Sign-in is now Google, so **the OAuth half
of this surface is load-bearing for identity and survives whatever happens to sync.** `auth.rs`,
the token refresh, the account model and the credential boundary are no longer Drive's to retire.
What decision 07 may still retire is the *sync* surface — the manifest, conflict analysis,
retention, the link session — and it now has to separate the two, which nothing in the code
currently forces it to do. [[contexts/desktop/remote-sync]] treats them as one domain.

**Reshaped 2026-08-17, and this is the decision the two-mode choice constrains hardest.** With
local workspaces permanently first-class, retiring Drive would strand every local workspace on
one device — the problem this effort exists to solve, reimposed on the users who did not opt
into the new mode. So the real question narrows to: does Drive stay as it is for local
workspaces, or is it replaced by something else that serves them? A hosted workspace almost
certainly does not need it either way.

**And the premise under that narrowing broke on 2026-08-18.** It rested on Drive being the
*only* route a local workspace has off its machine. #536 landed a whole-workspace export and
import — five sheets in write order, round-tripped in the running application against 5,000
tenants and 941 contracts — so there is now a second route, and "retiring Drive strands every
local workspace" is **false as stated**.

**What that does and does not change**, because the difference is the decision:

- It **reopens** retirement as an option. It was closed by an argument that no longer holds, and
  a closed option nobody re-opened when its reason expired is the failure this spec records
  rejected options to avoid.
- It does **not** make the two routes equivalent, and the gap is not small. Drive is automatic,
  continuous, versioned and retained, and it preserves the workspace exactly. The export is a
  human action producing a spreadsheet; it **names records rather than carrying their ids**, and
  it deliberately refuses to carry derived state — status, paid and expected amounts, unit
  status are recomputed on the far side rather than trusted. A user who loses a laptop between
  exports loses everything since the last one.
- So the choice is now a real three-way rather than the two the narrowing left, and **it is the
  human's**: Drive stays as it is for local workspaces; Drive is replaced by something that
  serves them; or Drive retires and the whole-workspace export is what a local workspace gets.
  Each answer prices differently against requirement 12 — the third is the cheapest to execute
  and the one that most changes what a local user is promised.

**Whatever is chosen, the OAuth half still survives it** — that was settled above and is
untouched by any of this.

**Answered 2026-08-18, and then reversed by the human the same day. Google Drive sync is
retired, and Turso sync is what replaces it.** *The recommendation below was taken under the
standing instruction and was wrong about what the human wanted; it is kept in full, as a rejected
option with its reasoning intact, because the spec records rejected options rather than deleting
them — and because whoever reopens this needs the argument against, not a note that there was
one.*

**The direction, verbatim:** *"google-drive sync will be dropped in favor of turso sync."*

So the three-way resolves to the third option, with the second half of its framing accepted rather
than avoided: it is the cheapest to execute **and** the one that most changes what a local user is
promised, and the human has taken both halves knowingly. The flag this section carried — *07 is
the only one of the four that changes what a user is promised* — is what the reversal came back
through, which is the whole reason it was flagged.

**What a workspace gets off its machine now, per mode.** This is the part the reversal has to
answer, because "dropped" alone does not say what stands in its place:

- **A hosted workspace** replicates through Turso. That is the answer to the whole effort, and it
  is now the *only* automatic one.
- **A local workspace** keeps its local snapshots — the backup machinery is not Drive's and does
  not go with it — and the whole-workspace export and import (#536) as its route to another
  machine. **It is a manual route and it loses things**, named rather than left to be discovered:
  it names records instead of carrying their ids, so a workspace that arrives that way is
  equivalent in content and not identical in rows; it deliberately refuses to carry derived state,
  recomputing status, paid and expected amounts and unit status on the far side; and **a user who
  loses a laptop between exports loses everything since the last one.**
- **A local workspace that wants better than that converts** — requirement 6, which is the answer
  the effort was built to give and which retirement now makes the only one.

**Requirement 2 is unaffected and that is worth stating plainly.** Local-of-record stays
first-class and permanent, a user may keep it indefinitely with no account, and nothing here
retires the mode. What is retired is one mode's *automatic off-machine route*, not the mode.

**What survives retirement, and it is more than it looks.** Sign-in is Google — decision 03,
directed 2026-08-17 and independent of this — so `tauri/src/sync/google/auth.rs`, the OAuth 2 +
PKCE flow, the token refresh, `RemoteSyncAccount` and the credential boundary are all load-bearing
for identity and are **not** Drive's to take with it. Local backup, snapshots and the protected
update snapshot are separate machinery and stay. Retirement removes the *sync* surface: the
manifest, conflict analysis, retention, the link session, and the Drive transport.

**What executing it means, because requirement 12 says decided is not enough.** Four things:

1. **The Drive sync surface is deleted, and the OAuth half is lifted out of it first.** That
   ordering is not optional: signing in happens *inside* `remoteSync.googleDrive.link()` today, so
   deleting the link session before the extraction takes identity with it. #543 is the extraction
   and it is now a prerequisite for the deletion rather than a tidy-up beside it.
2. **[[rules/credentials]] is superseded, not scoped.** *Concurrency* and *Transport testing* describe a
   transport that will not exist; they go with it, with their reasoning recorded as retired rather
   than silently dropped. ***Client boundary* does not go** — decision 09 widened it from Drive's
   credentials to every credential this application holds, and a workspace sync token is one. It
   survives its file and moves.
3. **[[contexts/desktop/remote-sync]] loses its Drive half** and keeps local backup and the OAuth
   session.
4. **The surfaces go too** — linking, unlinking, conflict resolution, sync reporting. Requirement
   12's *the surface is not left running with no stated purpose* is what this clause is for, and a
   retired mechanism whose buttons are still on screen fails it exactly as a kept one with no
   purpose would.

**What acceptance criterion 13 now demands, and it is a different demonstration.** The route
decision 07 chose is the whole-workspace export and import for a local workspace, and Turso for a
hosted one. So the criterion's *demonstrated end to end on two installations, by the route this
decision chose* is now **two demonstrations, not one** — because there are two modes and they no
longer share a route. And its second half, *name what the route loses*, is answered above for the
export and by decision 11 for Turso: **per column for the hosted route, and everything since the
last export for the local one.** The local number is the larger of the two by a wide margin, and
that is the price of the reversal stated where a criterion can check it.

**What it costs when organizations arrive** *(acceptance criterion 15)*: nothing, and retirement
makes it cleaner rather than worse. An organization workspace is hosted by construction, and there
is now one sync mechanism in the product rather than two.

**Removal condition.** None — this deletes a mechanism rather than deferring one. What *would*
reopen it is a local-of-record user population large enough that a manual export is a support
problem; there is none today, and the release data behind *Problem* says there is none at all.

### The recommendation this reversed, kept whole

*Recorded 2026-08-18 under the standing instruction, and overruled the same day. Everything below
argued for keeping Drive scoped to local workspaces.*

- **Retiring it and leaving local users the whole-workspace export is a product regression for
  exactly the population requirement 2 exists to protect.** The export is a human action producing
  a spreadsheet that names records rather than carrying their ids, and it deliberately refuses to
  carry derived state. Drive is automatic, continuous, versioned, retained, and preserves the
  workspace exactly. A local user who loses a laptop between exports loses everything since the
  last one — and requirement 2 makes that population permanent rather than transitional.
  **Cheapest to execute is not the same as cheapest to own.**
- **Retirement does not buy the deletion it looks like it buys.** Sign-in is Google, so the OAuth
  client, the token refresh, the account model and the credential boundary survive whatever
  happens to sync. What retirement actually removes is the manifest, conflict analysis, retention
  and the link session: working, tested Rust with a rule and a context already written against it.
- **Replacing it with something else is the most expensive answer and it competes with this
  effort's own.** A local workspace that wants automatic multi-device sync has an answer already —
  convert to hosted, requirement 6.

**Why it was overruled, as far as this can be read from the direction rather than guessed:** the
first argument prices a regression against a population, and *Problem* establishes that the
population is empty. The second prices deletion against maintenance, and a mechanism kept for
users who do not exist is maintained for nobody. **The argument was sound and its premise was the
one this spec had already struck.** That is worth recording precisely, because it is the second
time on this effort that a conclusion outlived the installed base it rested on.

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
say what the seam admits, because *Client boundary* in [[rules/credentials]] — "credentials belong in Rust
and there is no second place they could be" — was written when no browser client was contemplated.

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

Status: **decided 2026-08-18 — ten rows scoped or restated, one supersession, one code change, and
the organizations sketch acceptance criterion 15 waits on.** *Taken under the standing instruction
above.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: — *(was 11 and 05; both decided 2026-08-18)*

**One of its inputs arrived 2026-08-18, and it makes the job smaller.** Decision 11 measured
what divergence actually costs, and it is **per column, not per row**: two replicas editing
different columns of one contract both keep their edit, and only two writes to the *same*
column produce a loser. A row deleted under a concurrent edit is the exception — the delete
wins whole, with no error on either side. So the *Undo* reasoning in [[rules/data]] does not
have to survive "a row replaced wholesale"; it has to survive "a column overwritten by a later
push, and a deleted row that took an edit with it". That is a smaller thing to re-scope and a
smaller thing to explain to a user.

**Question.** The premise every one of these was argued from is changing. Each is either still
true under a remote of record, or is superseded here with its reasoning stated afresh:

| Rule | What it rests on |
| --- | --- |
| [[rules/data]], under *List reads* | whole result sets, argued from "there is no server" — and Turso bills rows *scanned* |
| [[rules/data]], under *Query cache* | `staleTime: Infinity`, argued from three enumerable writers and no unseen one |
| [[rules/data]], under *Undo* | a session stack of inverses, argued from a workspace being one syncable unit resolved by choosing a side |
| [[rules/credentials]], under *Concurrency* | concurrency detected rather than prevented, argued from Drive offering no compare-and-set |
| [[rules/credentials]], under *Client boundary* | credentials in Rust, which a browser client does not have |
| [[rules/api-layer]] | no repository layer — routers reach the database directly |
| [[rules/data]], under *Reconcile scope* | reconcile scoped by trigger, priced by decision 01 at one round trip per changed row |
| [[rules/api-layer]], under *One database client type* | one client type over two function types, which holds only if the chosen client can be driven through that seam — decision 11 is what tells us |
| [[contexts/repository]] | its first Boundary is **"There is no server"**, and it changes with them |

**This is bigger than it was when it was written.** The 2.x transition converted all thirty-four
ADRs into repository rules, each citing its origin — so what is being reviewed is live governance
that loads on the paths it names, not a folder of accepted records. A rule left standing after
its premise moved is worse than a stale ADR, because it is loaded and obeyed.

**Reshaped 2026-08-17, and mostly in a helpful direction.** With local workspaces permanently
first-class, the premise these rules rest on has not been *replaced* — it has been **narrowed**.
"There is no server" stays true of a local workspace and stops being true of a hosted one, so
the common answer is a scope rather than a supersession, and requirement 13 says so. That is
cheaper for most of the table. It is not cheaper for [[rules/data]], under *Query cache*, whose reasoning is
that the writers are enumerable and there is no unseen one: a hosted workspace has an unseen
writer by construction — another device — and no scoping makes that go away.

One ADR had no citing rule until 2026-08-17: ADR 0001, *One database client type*, restored as
[[rules/api-layer]], under *One database client type*, and now in the table above like the rest.

**This decision also carries the organizations gate, assigned 2026-08-17.** Acceptance criterion
15's promise — that nothing decided here forecloses organization workspaces — is checked here and
nowhere else. 09 produces a **written sketch of how an organization workspace would be added**,
re-reads every decision on this map against it, and reports what would have to be unpicked. The
criterion is met when the sketch exists and the answer is *nothing*. *Why it lives here: 09 is
already the decision that re-reads every other one against a changed premise, and a promise with
no owner is a promise that passes by default.*

**Three of the rules in that table now have landed code under them that was not there when it
was written** *(2026-08-18)*, and in each case the code moved the premise rather than the rule:

- ***List reads*** — #528 landed declared filters that narrow the read rather than the loaded
  rows. The rule's *why* is still "there is no server", and the new fact cuts **for** it against
  a hosted database rather than against it: Turso bills rows *scanned*, and a filter that reaches
  SQL is the thing that stops a full read being billed. 09 should say so instead of treating the
  rule as pure exposure.
- ***Undo*** — #532 landed a durable `history` table (`schema.ts:178`). Undo is still a session
  stack of inverses and the rule is unchanged, but the reasoning under it — a workspace is one
  syncable unit resolved by choosing a side — now has an append-only table of its own to answer
  for. **History is the first table in this schema whose rows are only ever inserted**, which is
  the shape that collides worst under last-push-wins (*Risks*): two devices' histories do not
  merge, one replaces the other, and the entry that says what happened is the thing lost.
- ***Query cache*** — unchanged, and still the row this decision cannot make cheap. Noted here
  only so that a reader does not assume the 2026-08-18 pass softened it.

Tickets #492, #493, #494 and #495 on [[efforts/work-the-surfaces-cannot-do/spec]] (#487) carried a
standing warning to be re-read against whatever this decision produces. **They are now landed
code rather than pending work** — complete 2026-08-18 — so the warning is discharged by re-reading
the tree, not by constraining a build. 09 does that re-reading.

**Answered 2026-08-18.** *Taken under the standing instruction recorded at the head of this
section.* **Ten rows, one supersession, one code change, and the organizations sketch.** The
common answer the 2026-08-17 reshaping predicted holds: the premise was narrowed rather than
replaced, so most of the table is scoped rather than rewritten. The exceptions are named
individually, because a table that says *scoped* nine times and hides the tenth is the failure
this decision exists to prevent.

| Rule | Verdict | What changes in the file |
| --- | --- | --- |
| [[rules/data]], *List reads* | **Holds, in both modes, with its *why* restated** | one sentence |
| [[rules/data]], *Query cache* | **Holds — by extending the writer list, not by relaxing the cache** | the writer enumeration gains a fourth |
| [[rules/data]], *Undo* | **Holds, and costs one code change in hosted mode** | a named exception |
| [[rules/data]], *Reconcile scope* | **Holds unchanged**; decision 01's pricing of it is superseded by the replica | nothing |
| [[rules/data]], *Payment aggregates*, *Mutation declaration*, *Multi-table writes* | **Untouched.** None of the three ever rested on there being no server | nothing |
| [[rules/credentials]], *Client boundary* | **Holds, and generalises beyond Drive** — it outlives its file | moves |
| [[rules/credentials]], *Concurrency* | ~~Holds, scoped~~ **Retired with the transport it describes** *(2026-08-18)* | deleted, with its reasoning recorded |
| [[rules/credentials]], *Transport testing* | ~~Holds, scoped~~ **Retired the same way** *(2026-08-18)* | deleted, with its reasoning recorded |
| [[rules/api-layer]], no repository layer | **Holds**, and it is what makes a third transport free | nothing |
| [[rules/api-layer]], *One database client type* | **Holds, and the gate confirmed the thing it depended on** | one sentence |
| [[contexts/repository]], first Boundary | **Superseded** — the only outright supersession on this map | rewritten |

**List reads.** The rule holds and its argument gets *stronger* under a hosted database rather
than weaker. Its stated *why* is "there is no server", which stops being true of a hosted
workspace; what replaces it is better than what it loses. Reads are served from the **local
replica**, so a list read is still a local query at local latency — decision 01 established it and
decision 11's run measured it. And Turso bills rows **scanned**, not rows returned, so the
declared filters #528 landed, which narrow the read in SQL rather than filtering loaded rows, are
precisely what keeps a whole-result-set read from being billed as a full-table scan. **The rule
that looked like the most exposed row on this table is the one the hosted mode most rewards.**
What would genuinely break it is a read that went over the wire per keystroke, and nothing in this
architecture does.

**Query cache.** This is the row the 2026-08-17 pass called the one no scoping makes go away, and
that assessment was right about the premise and wrong about the conclusion. The reasoning under
`staleTime: Infinity` is that the writers are enumerable and each announces itself — **not that
there are only three of them.** A hosted workspace has an unseen writer by construction, another
device, and the rule already carries the shape that answers it: the second of its three writers is
*a remote-sync pull reconciles fully and then invalidates the root*. Hosted mode adds a fourth
writer of exactly that kind — the replica's own pull — and the cache stays trusted because the
enumeration stayed complete. **The rule survives by naming the writer rather than by relaxing the
cache**, and that is the whole of it: `staleTime: Infinity` with an unannounced writer is a bug,
and with an announced one it is the same rule it always was. *What it costs if this is got wrong:
a stale surface, never a wrong write. The window is between another device's push and this
device's next pull, and closing it is the pull's job.*

**Undo.** The rule holds and this is the row that costs code. Undo is a **session** stack of
inverses replayed through the real procedures, so it never depended on the workspace being one
syncable unit — it depended on the inverse still making sense when it runs. Under the per-column
merge decision 11 measured, an inverse issued after another device changed a *different* column
does exactly the right thing, and one issued after another device changed the *same* column
overwrites their value, which is what any ordinary edit would have done and is not undo's problem.
**The exception is the one decision 11 also measured: a row deleted on another device takes a
concurrent edit with it, whole and with no error on either side.** So an inverse naming a row that
no longer exists must **fail visibly rather than silently write nothing** — and it must not
recreate the row, because recreating it would resurrect a record somebody deleted. That is a
change to the inverse path in hosted mode, it is small, and it is a ticket. **Local mode is
unaffected**: nothing can delete a row out from under a local session.

**Reconcile scope.** Unchanged. The rule is written against the *trigger* rather than the
mechanism, so "a remote-sync pull" gains a second source and needs no new words. What is
superseded is decision 01's **pricing** of it — one round trip per changed row — which was a price
for reading over the wire. Reconcile reads the local replica, so a whole-table pass costs what it
costs today and decision 11's run says so in as many words: nothing over the wire, followed by one
batched push.

**Payment aggregates, Mutation declaration, Multi-table writes.** Untouched, and listed here so a
reader can see they were considered rather than skipped. Materialised aggregates are argued from
the cost of computing them per request; a mutation declared once is argued from duplication; a
multi-table write batched is argued from atomicity, which the transport gives in both modes.
Nothing in any of the three cites the absence of a server.

**Drive, *Client boundary*.** Holds, and **generalises**: it becomes the rule for every credential
this application holds rather than Drive's alone. A workspace sync token is a credential, and it
lives on the same side of the same boundary for the same reason — the credential boundary and the
network boundary have to be the same boundary. *(A client with no Rust is decision 08's inventory,
and is not this effort's to build.)* **It therefore outlives the file it is in**: decision 07
retires the rest of [[rules/credentials]], and this section moves rather than going with it.

**Drive, *Concurrency* and *Transport testing*.** ~~Both hold and both are scoped to
local-workspace Drive sync.~~ **Retired 2026-08-18 with the transport they describe**, after the
human reversed decision 07. Both are about the Drive transport rather than about the domain, and
that transport is being deleted — a rule describing code that does not exist is worse than no
rule, because it is loaded and obeyed by whoever next touches something near it. **Their reasoning
is recorded as retired rather than deleted silently**: Drive v3 offers no compare-and-set, which
is why concurrency there was detected and repaired rather than prevented; and a mocked transport
trait tests the mock's idea of HTTP, which is why the transport was tested against a real local
server. Both facts stay true of Drive. Neither is a fact about this application any more.

**API layer, no repository layer.** Holds, and it is the quiet reason most of this effort is
affordable. Routers reach the database directly, so a hosted workspace changes *what `db` is* and
not *what a router does*. A repository layer would have been the thing every hosted-mode change
had to be threaded through.

**API layer, *One database client type*.** Holds, and the condition it was flagged with on
2026-08-17 — "which holds only if the chosen client can be driven through that seam" — is
discharged: decision 11's run drove `@tursodatabase/sync` through `createDatabase(single, batch)`
against a live database. Acceptance criterion 10 is the standing check.

**`contexts/repository`, first Boundary — superseded.** It reads **"There is no server. The API
layer is a direct caller executing in the webview. The only process boundary it crosses is Tauri's
IPC into Rust — never HTTP."** Two of those three sentences survive and the first does not. What
replaces it, and requirement 13 and acceptance criterion 14 are what check that it lands: a local
workspace has no server and the sentence is true of it word for word; a hosted workspace has a
remote of record and a control-plane API, and **neither is in the data path** — the API layer still
executes in the webview, reads and writes still reach a local file, and the only HTTP in the
picture belongs to the replica's own sync and to the credential the API mints. **The application
still never makes an HTTP call to fetch a record.** That is the property the original boundary was
really protecting, and it is worth more than the sentence that stated it.

*Why this is a supersession and not a scoping, when so much else here scoped cleanly:* a context's
Boundaries are read as facts about the repository rather than as rules with a scope, and
[[contexts/repository]] is the file every other artifact is read against. A boundary that is true
of one mode and false of the other cannot be left standing with a footnote — a reader who takes it
at face value and finds "never HTTP" builds against it.

### The organizations sketch — acceptance criterion 15

*The criterion is met when the sketch exists and names nothing that would have to be unpicked.
Here it is, and it names one addition and no unpicking.*

**How an organization workspace would be added.**

1. **The control-plane database gains an `organization` table**, and its `membership` row moves
   from *(account, workspace)* to *(account, workspace, role, permissions)* — which is what
   decision 04's capped bitfield column already is and where decision 05 already put it.
2. **A workspace record's owner becomes an account *or* an organization.** One nullable column
   more, on a table this effort creates anyway.
3. **The workspace database is unchanged**, and this is the load-bearing claim of the whole
   sketch. No domain table gains an owner column, because the workspace database is already the
   unit of ownership and a member's access is decided *before a token is minted*, not per row.
4. **Sign-in is unchanged.** A user signs in as themselves and reaches the workspaces they are a
   member of; today that list has one entry.
5. **The mint is unchanged in shape.** Today it asks *is this the owner*; then it asks *is this a
   member*, which is decision 05's chosen first shape already written down.
6. **Permissions stay coarse**, knowingly. An organization is where that cost is actually felt,
   and *Architecture* accepts it in advance with its reasoning: fine-grained per-record
   permissions and offline writes are mutually exclusive, and requirement 7 chose.

**Every decision on this map, re-read against that sketch:**

| Decision | What it would cost an organization |
| --- | --- |
| **01, 10, 11** — replica, client, gate | Nothing. All three are per workspace database and indifferent to how many people hold a token against it |
| **03** — control plane built here, as an API | Nothing. The sketch **needs** exactly this and could not be drawn without it |
| **04** — permission bitfield, capped at 53 | Nothing. It was sized for this and has never had a second use |
| **05** — membership grants full workspace access; roles govern administration | Nothing. It **is** the organization answer, chosen in advance of the need |
| **06** — the API owns migrations, at the mint | Nothing. Per workspace; the mint already runs per member |
| **07** — Drive stays, local-only | Nothing. An organization workspace is hosted by construction and never meets it |
| **08** — `Host` is a declared interface | Nothing, and it helps: an organization's second client kind is exactly what the inversion was for |
| **09** — this decision | Nothing. The rules above are scoped by **mode**, never by tenancy, so an organization workspace inherits the hosted scoping unchanged |
| **12** — conversion | Nothing. A personal workspace becoming an organization's is a change to the **owner row in the control plane**, not a data move — precisely because membership lives there and the workspace database carries none of it |
| **13** — UUIDv7 identity | Nothing, and it helps hardest: an organization has more concurrent writers, which is what the scheme exists for |

**One addition, named rather than buried.** A person in two organizations wants two workspaces on
one machine, and requirement 2 says an installation holds exactly one. That is *Out of Scope*'s
"more than one workspace per installation" and it is an **addition, not an unpicking**: the mode
discriminator, the session, the transport and the conversion are all per workspace already, and
what is missing is a workspace list and a switcher — which acceptance criterion 2 currently
forbids finding in the tree, deliberately and for this release. Adding one later changes no
decision above; it changes a criterion this effort wrote for itself.

**So the answer is: nothing would have to be unpicked.** Acceptance criterion 15 is met by this
sketch, and by decision 06's, 07's and 12's own organizations lines, which are the per-decision
half of the same promise.

## 12 — grilling(persistence): how a local workspace becomes a hosted one

Status: **decided 2026-08-18, and its question was withdrawn 2026-08-19. The answer is retained
because the mechanism outlived the feature.** *Opened 2026-08-17, when local workspaces became
permanently first-class; the human removed local-of-record on 2026-08-19, so there is nothing to
convert and requirement 6 no longer asks for it.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 03 *(was 11 and 03; 11 decided 2026-08-18)*

**What survives, and why this decision is amended rather than struck.** The chosen answer was **a
row-by-row copy through `createDatabase`'s two functions, ids carried verbatim**. No user will run
it as a conversion. **It is still the only safe way to put existing rows into a workspace
database**, and that is now a fact established by the Rust research rather than a preference:

- against an **MVCC** remote the engine **rejects** a populated foreign local file outright —
  *"local database contains tables without CDC history … the sync engine cannot preserve their
  data across the initial sync"*;
- against a **non-MVCC** remote it is worse, and silent: whether bootstrap runs is decided
  **solely by whether `{path}-info` exists**, nothing inside the `.db` is consulted, and the
  bootstrap branch writes remote pages with `truncate_on_first_response: true`. **There is no
  "is this already a database?" guard.**

*So this decision dodged both failure modes before either was known*, and anything that ever seeds
a workspace from existing rows — a fixture, a support recovery, an import at scale — inherits its
shape. **Requirement 16 is what keeps it simple**: identity is a client-minted UUIDv7, so *carry
it* is the whole of the id story.

**What is withdrawn with the question**: the mode flip and its ordering, the verification pass as
a user-facing step, the safety copy left on disk, and everything below about what the application
says about a dormant local file. *The reasoning is left in place unedited* — it is the record of a
decision taken properly, and a reader who meets the copier elsewhere should be able to find why it
is shaped as it is.

**What the two rejected routes are still rejected for**, since both would be re-proposed by anyone
reaching for a seeding mechanism: #536's export and import **names records instead of carrying ids
and mints fresh ones on the far side**, so `history.record_id` would point at nothing with no
foreign key to catch it; and a provider-side import from a dump puts a whole workspace through
infrastructure this repository would have to operate and pay for.

---

*What follows is the decision as taken on 2026-08-18, unedited.*

**Question.** Requirement 6 says a user may convert a local workspace to a hosted one, losing
nothing. Nothing in this effort had covered how, because until the two-mode decision there was
only a one-way migration nobody had scoped either.

What the answer has to settle:

- **What the conversion actually moves.** A local workspace is a SQLite file with a schema Rust
  migrated. A hosted workspace is a database created through a provider API with a schema
  something else migrated. Whether the conversion is a row-by-row copy through the client, a
  file upload the provider accepts, or a dump-and-replay decides how long it takes and what it
  can fail halfway through.

  **A fourth route exists now and did not when this was written** *(2026-08-18)*: #536's
  whole-workspace export and import already moves a whole workspace between two databases, in
  write order, resolving every reference before the write and issuing the result as one batch.
  It is the obvious thing to reach for and **it is not obviously right**, which is exactly why it
  is named here rather than assumed: it names records instead of carrying their ids, so a
  converted workspace's rows come out with **different ids from the ones they had** — every
  history entry points at `record_id`, and the local file kept as a safety copy under acceptance
  criterion 6 would no longer describe the same rows as the hosted workspace it came from. 12
  decides whether that is acceptable, repairable, or disqualifying.
- **What happens to the local file afterwards.** Acceptance criterion 6 says it is not destroyed
  as part of the conversion — so it becomes a stale copy of a workspace that has moved, and
  something has to say what the application does when it finds one.
- **What happens to a Drive link the workspace already had.** Existing installs may be linked,
  and after conversion the workspace's record of truth is somewhere Drive knows nothing about.
  Leaving both running means two sync mechanisms writing one workspace, which is the shape
  [[rules/credentials]], under *Concurrency*, exists to reason about and was never designed to survive.
- **Whether it is interruptible and what a half-finished conversion leaves behind.** It needs a
  network by definition, and the user running it is the one most likely to have a bad one.
- **What it costs to reverse**, which is the open question about one-way conversion. The answer
  here is what makes that question cheap or expensive to revisit later.

**Answered 2026-08-18. A row-by-row copy through the existing client seam, ids carried verbatim,
and the mode flips only after the copy verifies.** *Taken under the standing instruction recorded
at the head of this section.*

**The obvious candidate is the wrong one, and it is worth saying why first.** #536's
whole-workspace export and import already moves a workspace between two databases, in write order,
as one batch — and it is disqualified here for exactly the reason it was named: it resolves
records **by name** and mints fresh ids on the far side. Under requirement 16 a record's identity
is the record's own, and `history.record_id` carries no foreign key, so a workspace converted that
way would arrive with every row renumbered and every history entry pointing at nothing, with
nothing in the schema to catch it. The local file kept as a safety copy under acceptance criterion
6 would then describe different rows than the workspace it came from — the failure that criterion
exists to make visible. **The export stays what it is: a user-facing exchange format, not a
migration tool.**

**What is chosen instead: a row-by-row copy through `createDatabase`'s two functions**, table by
table in write order, issued as batches, with every column carried verbatim — ids included.
**Requirement 16 is what makes this simple**: after #541 an identity is already a client-minted
UUIDv7, so *carry it* is the whole of the id story and there is nothing to remap. This is the one
place the identity work pays for itself twice — it was done for replication, and it turns
conversion from a translation into a copy.

Rejected, and named so neither is re-proposed:

- **A dump-and-replay.** Correct, and it needs a SQL dump the desktop would have to produce and
  the hosted database to accept statement by statement. It buys nothing the copy does not give and
  it goes around the one client type acceptance criterion 10 protects.
- **A file the provider seeds a database from.** The provider can create a database from a dump at
  a URL, which means putting the whole of a user's workspace through infrastructure this
  repository would then have to operate, secure and pay for, for the duration of the upload. The
  copy needs no third party and no bucket.

**Whether it is interruptible, and what a half-finished conversion leaves behind.** The conversion
runs against a freshly created, empty hosted database and **never writes to the local file**. The
mode flips at the very end, after a verification pass — a per-concept count comparison and a
spot-value comparison, which is acceptance criterion 6's check run as part of the conversion
rather than only in a test. So there are exactly two states to be found in afterwards: *mode still
local, and a partial hosted database exists* — resumable, because the copy is idempotent by
primary key, or discardable, because the provider database can be deleted and made again; or
*mode hosted, and the copy verified*. **There is no state in which a user's records live anywhere
but the local file until the copy has been checked**, which is the property that makes a bad
network survivable, and the user running this is the one most likely to have one.

**What happens to the local file afterwards.** It stays where it is and the application stops
treating it as the workspace. It is not opened, it is not listed as a second workspace, and
acceptance criterion 2's *a search of the tree finds no workspace list and no switcher* is
unaffected. What the application says about it is one line in settings — the file, the date it was
converted, and a reveal-in-folder action, the shape the export already uses. **What it must not do
is offer to open it**, because an offer to open it is the switcher this effort does not have.

**What happens to a Drive link the workspace already had.** *Simplified 2026-08-18 by the reversal
of decision 07, which retires Drive sync outright.* There is no link to unlink by the time a
conversion exists: retirement happens on this effort, ahead of conversion, so a converting
workspace has no Drive relationship to end. **What the retirement itself owes is a separate
obligation and it is decision 07's, not this one's** — snapshots already in a user's Drive are the
user's, and retiring the mechanism does not delete them.

*What this clause used to say, kept because the reasoning is the reason the ordering matters:* the
conversion unlinked Drive deliberately and visibly, because leaving both running would put two
sync mechanisms on one workspace — the shape [[rules/credentials]], under *Concurrency*, was never
designed to survive. **Retirement makes the problem not arise rather than solving it**, which is
the cheapest form of an answer and worth noticing as a second, unadvertised gain of the
reversal.

**What it costs to reverse**, which is the open question this decision was asked to make cheap or
expensive. Converting hosted back to local is *Out of Scope* here, and this choice is what keeps
it cheap: the same copier run the other way, over a client type that is identical in both
directions, against records whose ids never changed. **Nothing in this decision makes reversal a
rewrite** — and had the export route been taken, reversal would have been a second renumbering on
top of the first.

**What it costs when organizations arrive** *(acceptance criterion 15)*: nothing. A personal
workspace becoming an organization's is a change to the owner row in the control plane rather than
a data move, precisely because membership lives in the control plane and the workspace database
carries none of it. Decision 09's sketch works the same point from the other side.

**Removal condition.** If a provider-side import ever accepts a whole SQLite file with no
intermediary, it is strictly better for a large workspace and this decision should be re-read.
The verification pass and the flip-the-mode-last ordering survive that change unaltered; only the
copy loop is replaced.

## 13 — grilling(persistence): what a record's identity is under replication

**Confirmed against a live database 2026-08-18.** Two disconnected replicas each inserting a
row into a table keyed by a client-assigned `TEXT` produced two rows, both present and both
distinct — where the same experiment against `INTEGER PRIMARY KEY` produced one row and lost
the other with no error on either side. The scheme chosen here is not merely reasoned to work;
it has been run. See
[[efforts/a-workspace-follows-its-user/evidence/prototypes/turso-sync-against-a-live-database]].

Status: **decided 2026-08-18 — a UUIDv7 held as `TEXT`, generated on the client that creates the
record, one scheme for both modes, migrated onto a populated workspace.** *The delivery clause
was struck and restored on 2026-08-18: struck because there are no existing installs, restored
because acceptance criterion 1 requires a populated pre-effort workspace to survive into this
effort's release. **The choice of scheme was never in question in either direction** — it
answers how two replicas avoid producing one identity, which has nothing to do with who is
running v0.12.0.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: —

**Opened and closed on 2026-08-18**, because the premise was found rather than asked. Every
primary key in this schema is a bare rowid taking the next id above the highest in use — verified
in the tree, and stated by the application in its own code at `src/lib/contract/router.ts:435-446`.
That is correct for one writer and collides by construction for two, so two replicas of one
hosted workspace assign the same id to different records and last-push-wins merges them. *Risks*
carries the consequence; this is where the answer lives.

**It is upstream of the data path rather than part of it.** Sync through the vendor and two
records merge; sync through an API this repository writes and the convergence code has to invent
an identity scheme anyway. No choice at decision 10 or decision 11 reaches it.

**Question.** What replaces the rowid, given the scheme must be assignable with no coordination
— a client creating a record offline cannot ask anything what the next id is.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — UUIDv7 as `TEXT`** *(chosen)* | Time-ordered, so inserts stay sequential and index locality behaves like the rowid it replaces. No coordination, so offline creation works by construction. A standard, understood by every tool that understands UUID | 36 characters per key instead of 8 bytes, on every key and every foreign key. The table stops being an `INTEGER PRIMARY KEY` rowid alias | Size and index behaviour at scale — bounded here: the largest real workspace measured is 5,000 tenants and 941 contracts | One generator, called at the point of creation. The two `max(id)` call sites are **deleted** |
| **B — ULID as `TEXT`** | The same properties in 26 characters, case-insensitive base32, easier to read in a log | Not a standard the way UUID is, so nothing understands it natively | Low, and the same as A | The same as A, plus owning the encoding |
| **C — per-device integer ranges** | Keeps integer keys and the rowid alias entirely | A device that exhausts its block offline **cannot create records** | Allocation needs the API, which puts a network dependency back into the write path that requirement 7 exists to keep out | Block allocation, exhaustion, and reclamation — all new, all this repository's |
| **D — composite key: device plus counter** | Keeps integers, needs no coordination at all | **Every primary key becomes two columns, so every foreign key does too** — `contract_unit`, `payment`, and every `history` row. Every join widens | Low correctness risk, highest blast radius on code that exists | The most invasive of the four by a wide margin |

**Chosen: A**, by the human, on the recommendation recorded here. B is A with a worse
interoperability story and no offsetting gain. C reintroduces exactly the network dependency in
the write path that requirement 7 exists to remove. D is safe and correct and touches nearly
every query in the application to buy an integer nobody needs.

**What it costs when organizations arrive** *(acceptance criterion 15)*: nothing. Identity is
orthogonal to membership, and a workspace with several members needs collision-free ids more
than a personal one does — a second writer stops being one person on two laptops and becomes two
people at once.

**Removal condition.** None — this replaces a scheme rather than deferring one. What *is*
conditional is the migration: if requirement 16 is ever narrowed back to hosted workspaces only,
the local schema keeps rowids and the remapping moves into decision 12's conversion. That path
was offered on 2026-08-18 and not taken.
