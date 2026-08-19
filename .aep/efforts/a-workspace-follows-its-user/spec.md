---
aep: 2.5.1
owner: repository
date: 2026-08-18
kind: spec
status: accepted
---

# Problem

A workspace is a file on one machine, and the application has never asked who is using it.

The database is local SQLite and it is of record. The only way a workspace reaches a second
machine is a Google Drive exchange of whole-file snapshots, resolved when the two sides
disagree by choosing a side ([[rules/drive]], under *Concurrency*). The request context carries a
database, a clock and a host and nothing else (`src/lib/api/context.ts:36`); the schema has no
user table and no ownership column anywhere.

**The domain has never asked who. The application has.** That distinction was blurred until
2026-08-17, and it matters: `RemoteSyncAccount` already carries an `id`, `email`, `display_name`,
`avatar_url`, `provider_user_id`, `token_expires_at` and `refresh_token_available`, and
`tauri/src/sync/google/auth.rs` implements OAuth 2 with PKCE and refresh behind the credential
boundary [[rules/drive]], under *Client boundary*, describes. So identity is **not** built from nothing —
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
to be deleted rather than carried — **after acceptance criterion 1 has used the last of them
as its subject, not before** *(sequenced 2026-08-18; the criterion has the reasoning)*. What this changes is only *arrival*: no data has to survive
this change, so the effort keeps its architecture and loses its migration. What it does **not**
change is the shape of the product — see the first Constraint, which now rests on the one
justification it always had independently.

# Goal

A **hosted** workspace follows its user: they sign in once and find it on whichever client they
opened. A hosted workspace is a database of its own — of record remotely, replicated locally —
and the application stays fully usable with no network.

**A local workspace stays exactly what it is.** Where the record of truth lives becomes a
property of the workspace rather than of the application, and both values are first-class: a
user may keep a local workspace forever, without an account, and nothing about this effort
degrades it. **Confirmed by the human 2026-08-18, after the installed base turned out not to
exist**: two permanent modes are wanted on their own merits, not as a compatibility story.

When this lands, a second client kind could be added and organization workspaces could be added
without reopening any decision made here. **Neither is built.**

# Scope

- **Two records of truth, both first-class.** A workspace is local-of-record or hosted-of-record,
  and the application supports both for as long as both exist. This is the decision that shapes
  every other item in this list: each one below answers for two modes, not one.
- **The adoption path**, ~~what an existing local workspace does when the update arrives
  (nothing, by requirement), and~~ how a user converts a local workspace to a hosted one when
  they choose to. *Half struck 2026-08-18: there is no existing local workspace but a
  developer's, so "what it does when the update arrives" is not a thing this effort has to
  answer for anybody. **The conversion half is untouched and is the whole bullet now** — it is
  requirement 6, and decision 12 is open on it.*

  *This bullet is the one the 2026-08-18 respecify missed. It edited Problem, Goal,
  Requirements, Acceptance Criteria, Constraints, Assumptions, Risks, Architecture, Migration
  and Decisions, and left Scope alone — recorded because a section that survives a premise
  change untouched is usually the one nobody re-read, not the one that needed no change.*
- **Identity, and it starts from Google.** A user record, how long a session lasts, and what the
  request context carries as a result — including what it carries when there is no user because
  the workspace is local. **How they authenticate is directed as of 2026-08-17: sign in with
  Google**, reusing the OAuth 2 + PKCE flow, refresh handling and account shape that already
  exist in Rust. Decision 03 works out what that means for the user record and the control plane;
  it does not reopen the choice of provider.
- **The control plane, and it is built here.** Users, workspaces and membership: one
  always-online multi-tenant database behind **an API this repository designs**, which also
  creates each workspace database and mints the token a client syncs with. *Directed by the human
  2026-08-18; the "whether this repository builds it or buys it" this bullet used to end on is
  answered.* Designed here, deployed elsewhere — see *Out of Scope*.
- **Where the data path runs, and where it does not.** Offline-capable clients sync **directly**
  with their workspace database; the API is in the credential path continuously and in the data
  path never. It is the property three requirements rest on, and *Architecture* has the reasoning.
- **Workspace persistence.** A hosted database of record with a local replica, reached through
  the transport seam that already exists — `createDatabase(single, batch)` at
  `src/lib/platform/database/client.ts:47` takes two function types, production passes Tauri's
  `invoke` and tests pass an in-memory engine, and a hosted workspace is a third caller at that
  same seam.
- **What a hosted workspace replicates, and `history` is the question that forces it**
  *(added 2026-08-18)*. #532 landed a durable `history` table, so the workspace now holds a
  record of what was done to it as well as the records themselves. **It replicates** — a user
  who opens their workspace on a second machine and finds no account of what they did on the
  first has been handed half a workspace, and requirement 4 says the workspace follows them.
  Stating it costs a line; leaving it implicit gets it decided by whoever first writes the sync
  configuration.

  **The consequence is not free and belongs here rather than in a footnote.** History is the
  first table in this schema whose rows are only ever inserted and never updated, which is the
  worst shape under last-push-wins: two devices' histories do not merge into one longer history,
  one replaces the other, and what is lost is the very record that would have said so. It is
  the same finding as *Risks*' identity collision seen from the other side, and decision 11's
  question 2b covers both.
- **The workspace discriminator.** `provider` is `local | googleDrive` today and is load-bearing
  in the sync flows (`src/lib/sync/workspace.ts:32`). A hosted workspace is a third value of it,
  and every flow that branches on it answers for the new one.
- **Migrations against a hosted workspace.** Who applies them, and what a client older than the
  schema it meets does about it.
- **Google Drive sync's fate.** *Restated 2026-08-18, because the constraint that shaped it is
  no longer true as written.* It said a local workspace's only route off its machine is Drive.
  Since #536 a workspace **exports and imports whole**, so there is a second route — manual, a
  spreadsheet, and deliberately not an equal substitute. What survives is the weaker and still
  binding form: a local workspace must keep a way off its machine, and whatever Drive becomes is
  measured against that rather than against being irreplaceable. Decision 07 carries the
  difference.

  **Decided 2026-08-18: Drive sync retires in favour of Turso sync**, directed by the human. The
  weaker form above is what a local workspace is left with, exactly as written — the export is the
  way off the machine, manual and not an equal substitute, and that is now the arrangement rather
  than the fallback.
- **The rules resting on "there is no server."** Which survive the premise change, which are
  **scoped to local workspaces** rather than superseded, and the first Boundary of
  [[contexts/repository]] with them.

# Requirements

1. **An update never asks for an account, a network, or a manual step in order to reopen a
   workspace the user already had.** After a new version arrives through the updater, the
   application opens the same workspace, with the same data, and needs nothing from the user.

   *Rewritten 2026-08-18. It read "An existing local workspace survives the update untouched",
   and existed to protect an installed base that turns out to be empty. **The promise is kept
   rather than struck**, because it is the one requirement here that is not about the hosted
   architecture at all: it is what the updater owes anyone, and it starts owing it the day the
   first person installs this. What it loses is its urgency, not its truth — it is now a
   forward promise rather than a rescue.*
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

    **Decided 2026-08-18: it retires, in favour of Turso sync** *(decision 07, directed by the
    human)*. **The second clause is what the retirement has to answer**, and it does not answer it
    by keeping anything: what serves a local workspace afterwards is its local snapshots and the
    whole-workspace export and import, which is a manual route that loses everything since the
    last export. That is the cost, accepted knowingly, and *Risks* carries it. **The requirement
    is not softened by the reversal** — "executed" now means the Rust sync surface and its user
    surfaces are deleted, not merely stopped being recommended.
13. Every rule and boundary resting on "there is no server" is restated as still true, scoped
    explicitly to local workspaces, or superseded with its reasoning written afresh.
14. Organization workspaces are not built, and nothing built here forecloses them.
15. **A session survives three days without a connection, and any connection inside that window
    renews it.** *Directed by the human 2026-08-18, promoted from an open question to a
    requirement.* A signed-in desktop client works offline for three days; reaching the API at
    any point inside the window renews the session and the window restarts from there. Past
    three days with no contact, a hosted workspace requires signing in again. **A local
    workspace is unaffected and has no session to expire** — it never signed in.
16. **A record's identity is assigned so that two replicas cannot produce the same one.**
    *Directed 2026-08-18.* Today every primary key is a rowid taking the next id above the
    highest in use, which is correct for a single writer and collides by construction for two.
    **One scheme covers both modes.** The scheme is decision 13's; that it is one scheme is
    settled here.

    **It is applied by a migration when the update lands.** *Amended twice on 2026-08-18, and
    the second amendment reverses the first.* The clause was struck in the morning on the
    grounds that there are no existing installs to apply it to; it is restored because
    **acceptance criterion 1 manufactures one deliberately** and requires its data to survive.
    A migration owed to a criterion is owed exactly as hard as one owed to a user — the
    criterion was written to stand in for the user.

    *What the round trip settles, so it is not re-litigated: collapsing `0000`–`0002` into a
    single migration with `TEXT` keys from the start is **not** available, because the pair
    criterion 1 names includes a release that already applied all three. The identity change is
    an added migration, never a rewritten one — which is also what acceptance criterion 12's
    "unchanged" has always required, and it now has a reason rather than an inheritance.*

# Acceptance Criteria

1. **Install the previous release, populate it, and update to the current one through the real
   updater: the same workspace opens, with the same data, and nothing asks for a sign-in.**
   *(requirement 1)* No CI run substitutes for it — it needs a real installed build and a real
   update, exactly as the monorepo effort's release criterion does.

   **Rehearsed 2026-08-18. Not met, and it cannot be met until this effort has a release.**
   *Corrected by [[skills/refine]] the same day — it read "Run 2026-08-18, and it passes".*
   The run was `v0.12.0` into `v0.13.0`, and **neither build contains a line of this effort**:
   no `TEXT` keys, no `Hosted` variant, no session. What it exercised is the updater, the
   artifact `latest.json` resolves to, and the migration runner. What requirement 1 is actually
   exposed to is **the update that carries requirement 16**, and that update does not exist yet.
   A criterion recorded as passing by a run that could not have exercised the change it guards
   is the defect criteria 13 and 15 were each rewritten for, arriving a third time.

   **So the criterion is discharged by one specific pair and no other**: the last release before
   this effort, updated into the release that carries it. *Directed by the human 2026-08-18.*
   **This orders the release deletion**, which until now was a clause in *Problem* with no
   sequence attached: the last pre-effort release is the subject of this run and is deleted
   after it, not before. Deleting it first does not make the criterion pass — it makes it
   unrunnable, which reads the same at review and is not the same thing.

   **And it checks the migration, not merely the launch** *(restored 2026-08-18, after the
   human directed the migration be written in full)*. The morning's respecify moved these
   checks out of here on the grounds that criterion 17 covers referential integrity. **It does
   not** — 17 covers two replicas *creating* records that must stay distinct, which is a
   different failure from a remap of records that already exist. Between the two, the identity
   migration's correctness had no criterion at all for a few hours. So this criterion adds,
   against the populated pre-effort workspace, after the update:

   - **The count per concept is identical** before and after. Tenants, complexes, units,
     contracts, assignments, payments, and `history` rows.
   - **Every reference still resolves to the record it named before the update** — contracts to
     tenants, `contract_unit` on both columns, payments to contracts, and **every `history` row
     to the record it describes**, with the one legitimate exception that a deleted record's
     history entry is meant to dangle.
   - **`history` is the one to check first and it is the one nothing would catch.** It has no
     foreign key, so a `record_id` left unmapped violates nothing, fails no query, and shows up
     as a workspace that opens fine and quietly describes the wrong records. *Data Model* says
     the same thing from the other side.
   - **A workspace interrupted mid-migration opens afterwards**, fully migrated or untouched,
     never half of each. **Already answered from the code**, and the answer holds for the new
     migration only if it is written as one file: `tauri/src/database/migrations.rs`, in
     `apply_migration`, commits a file's statements and its `__migrations__` row in one
     transaction. *That is a constraint on how the identity migration is written, not a
     property it inherits* — split across two files, the guarantee is gone and nothing warns.
   - **The snapshot the updater took before installing is present afterwards, and restores to
     the workspace as it stood before the migration.** *Added 2026-08-18 by [[skills/tasks]],
     directed by the human.* The backup was an obligation in *Migration* that **no criterion
     checked** — the gap shape this spec has now hit three times, where an obligation nothing
     exercises reads at review as covered. It is invisible while the migration succeeds, which
     is exactly when nobody notices it was never taken. **It is checked against
     `prepare_update`'s existing protected snapshot rather than against any file on disk**, and
     that wording is load-bearing: the rehearsal drove `msiexec` directly and so took none. The
     run that discharges this criterion goes through the in-app updater, or this bullet is
     checking nothing.

   **What the rehearsal is worth keeping for**, since it is real and it was not free: the
   procedure is known to work end to end, so the run at release time is a repeat rather than a
   first attempt, and one of its findings is permanent. A `v0.12.0` install was populated with
   5,000 tenants, 10
   complexes, 95 units, 1,177 contracts, 1,729 assignments and 709 payments, then updated in
   place to `v0.13.0`. Migration `0002` applied; every count identical; all five references
   resolving at zero dangling; `history` created and empty. The application's own diagnostics
   record three launches and no error event — `applied: 2`, then `applied: 0` on a workspace
   already migrated, then `applied: 1`. **The interruption clause is answered from the code
   rather than the run**: `tauri/src/database/migrations.rs`, in `apply_migration`, commits a
   file's statements and its `__migrations__` row in one transaction, so a file is all-or-nothing
   and the next launch resumes from the journal.

   **Two gaps, named rather than left to be assumed closed.** The run drove `msiexec` on the
   exact artifact `latest.json` names for `windows-x86_64`, so the endpoint, the version
   comparison, the artifact choice and the install are all verified and **the plugin's own
   check-download-relaunch is not**. And Drive was never linked, so a Drive link surviving an
   update is unverified. Both are cheap to close and neither is load-bearing for this effort.

   *Rewritten 2026-08-18. It required `v0.12.0` specifically, required a Drive link, and carried
   a second paragraph making it the check that "protects people who already use the
   application" against a primary-key rewrite on their machines. There is nobody to protect and
   there is no rewrite to survive, so what is left is the ordinary promise that an update does
   not cost you your workspace — worth keeping, and much lighter. **The referential-integrity
   checks it grew are not lost**: they belong to criterion 17, which is where replication
   correctness is actually decided.*
   **Discharged as a gate on this effort 2026-08-18, by direction, and kept as a release check.**
   The human directed that the previous version has no users, that no breakage story is owed to
   it, and that this effort is moving to a new architecture rather than carrying an old one
   forward. That withdraws the one thing still holding this criterion up. It was restored in the
   morning **because** it manufactures a populated pre-effort workspace, and the whole reason to
   manufacture one was to have something the identity migration must not break; a manufactured
   subject that nobody has asked for is a subject the direction is entitled to withdraw.

   **The direction does not delete the checks, and it did not have to — they were already met
   somewhere better.** Every bullet above but two is discharged by #541's Rust migration harness,
   which runs the shipped runner over a workspace populated as the old schema and asserts them
   directly rather than by inspection:

   - the count per concept is identical → `a_populated_workspace_crosses_the_identity_migration_whole`;
   - every reference resolves to the record it named, all five reference columns → the same test,
     each joined through the mapping the migration built;
   - **`history`** → the same test, and the orphan pass it exercises is the one a deliberate
     mutation showed was load-bearing rather than defensive;
   - **a workspace interrupted mid-migration** → answered from the code, in `apply_migration`,
     which commits a file's statements and its `__migrations__` row in one transaction. Unchanged,
     and the identity migration is one file, which is what that answer required.

   **The two that remain are the two that need a real install**: the updater's own
   check-download-relaunch, which the rehearsal went around by driving `msiexec`, and
   `prepare_update`'s protected snapshot being present afterwards and restoring to the workspace
   as it stood. **They become a release check rather than an effort gate** — owed to the first
   real user, run at the release that first carries this effort, and recorded here when it runs.
   That is what requirement 1 has said since it was rewritten: a forward promise rather than a
   rescue.

   **And it releases the ordering this criterion imposed.** The last pre-effort release was being
   kept alive because this criterion needed it as its subject. Nothing needs it now. Deleting it
   publishes a change to what this project offers the world, so it stays the human's to do rather
   than something this discharge quietly authorises.

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
   a losing writer loses** — per statement, per row, per field, or **per record identity** — and
   that answer is written into this spec rather than discovered later. *Extended 2026-08-18: the
   fourth term was missing, and it is the one this schema makes likeliest. See* Risks *and
   decision 11's question 2.* The test covers **two devices creating unrelated records**, not
   only two editing one — the second is the contended case and the first is the guaranteed one.

   **Half of this is answered and the criterion did not say so** *(2026-08-18)*. Decision 11
   measured it live: the contended loss is **per column**, not per statement, row or field,
   and a row deleted under a concurrent edit is taken whole with no error on either side. The
   uncontended case is the identity collision, and requirement 16 closes it. So *"that answer
   is written into this spec"* **is satisfied** — it is in decision 11 and in decision 09's
   preamble. What is **not** satisfied is *"a test demonstrates"*: the demonstration was a
   prototype, and [[rules/module-layout]] had it deleted. **A criterion met by a deleted
   prototype is not met**, so what remains here is a kept test, and the finding it must
   reproduce is now known in advance rather than being what the test discovers.
10. `createDatabase` still returns one client type. Production, test and hosted transports all
    satisfy it, and a search of the tree finds no second database client type.
11. A procedure needing the acting user reads it from the context, and
    `src/lib/api/tests/context.test.ts` covers a request carrying identity and one carrying none —
    the second being an ordinary local-workspace request rather than an error case.
12. Applying a migration to a hosted workspace is a documented path that has been exercised end
    to end. A client older than the workspace schema shows a message naming the action to take,
    and issues no write. A local workspace's migrations are applied by Rust exactly as now,
    demonstrated by ~~the existing Rust migration tests~~ **a Rust migration harness, which does
    not exist yet and is part of this work**, still passing unchanged thereafter.

    *Corrected 2026-08-18 by [[skills/plan]], against the tree.* `database/migrations.rs` and
    `database/mod.rs` contain no tests at all. This criterion has read since it was written as
    though its local half were already covered by something that has never existed — **the one
    shape of defect this spec has now caught four times.** *Technical Approach* says what the
    harness owes.
13. Whatever Drive becomes is true in the tree, and **a local workspace's data still reaches a
    second machine and comes back** — demonstrated end to end on two installations, by whatever
    route decision 07 leaves it, **and the route demonstrated is the one decision 07 chose.**
    Where the answer keeps Drive in any form, the demonstration is over Drive; a workspace moved
    by export and import does not stand in for it.

    Additionally, and this is the half that has teeth: **the demonstration covers what the chosen
    route loses.** Name it. Drive carries the workspace exactly; the whole-workspace export names
    records instead of carrying ids and recomputes every derived value on the far side, so a
    workspace that arrives by that route is equivalent in content and not identical in rows.

    **Resolved 2026-08-18 by the human's reversal of decision 07: Drive sync is retired, so the
    clause about keeping Drive does not fire and the export is not standing in for anything — it
    *is* the local workspace's route.** So this criterion is now **two demonstrations rather than
    one**, because the two modes no longer share a route: a local workspace exported on one
    installation and imported on another, and a hosted workspace reaching a second installation
    through Turso. And what each loses is named and is not the same size — **per column for the
    hosted route, and everything since the last export for the local one.** The second number is
    the larger by a wide margin and it is the price of the reversal, recorded here because this is
    where a criterion can check that it was stated rather than discovered.

    *Rewritten twice. 2026-08-17: the original ("can still reach its remote by whatever route the
    decision leaves it") passed whatever decision 07 decided, which is not a criterion. **2026-08-18:
    the replacement had gone stale within the day** — #536 landed a whole-workspace export and
    import, so "data reaches a second machine and comes back" became true of this application
    with Drive deleted and no decision taken at all. A criterion that a broken version passes is
    the defect this one keeps acquiring, which is why the route is now named and the loss is now
    part of what is shown.*
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
16. **A signed-in client with no network works for three days and then asks for a sign-in; one
    that reconnected inside the window does not.** *(requirement 15)* Tested by moving the clock
    rather than by waiting: sign in, disconnect, advance past the window, and the application
    asks; repeat with one successful reach inside the window, and it does not. The refusal names
    the action to take, and **no write made during the window is discarded to produce it** — an
    expiry that eats unsynced work fails this criterion. **A local workspace run through the
    same test never asks for anything.**
17. **Two clients, each disconnected, each creating records the other has never seen, produce
    records that are all present and all distinct after both sync.** *(requirement 16)* Counted,
    not spot-checked: the number of records afterwards equals the number created. Run for every
    concept the schema carries, `history` included, since it is the table whose rows are only
    inserted. **The pre-migration behaviour is captured as a failing test first** — the collision
    is demonstrated before it is fixed, so the fix is shown to be what closed it.

# Constraints

- **No install may be forced to change.** An update reaches a machine through an updater, not
  through a decision its user made about architecture, so a version that requires an account, a
  network, or a manual step in order to reopen data the user already had is a data-loss event
  with a friendly name.

  *Amended 2026-08-18. This opened "No existing install may break" and justified itself with
  five shipped releases holding real people's rent records. **Neither half survives** — there
  are no existing installs and no real records on them. The constraint is kept because it is
  about what an updater owes anyone it ever reaches, which is a property of shipping an
  auto-updating desktop application and not of having shipped one already.*

  **What this no longer does is carry the local mode.** It used to be "what makes the local mode
  a constraint rather than a preference", and that reasoning is void: with no installed base,
  local-of-record is not protecting anyone. The mode survives on the Constraint below it —
  offline-first, and an account required for a hosted workspace and for nothing else —
  **confirmed as wanted on those merits by the human, 2026-08-18**, when the alternative of
  making hosted the only mode was put to them and refused.
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
  [[rules/api-layer]], under *One database client type*, restored 2026-08-17.
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
- **The control-plane dashboard website.** Named by the human 2026-08-18 as part of the shape and
  **not built here.** It is the always-online surface the *Architecture* describes reaching the
  API directly, and naming it is what stops the API being designed as though the desktop were its
  only caller. *Why this is a separate exclusion from the line above: a dashboard administering
  accounts and workspaces is not a client of a workspace database, so "no web client" does not
  already cover it — and an exclusion that has to be inferred is the one that gets built.*
- ~~**Building or deploying an API service.**~~ **Struck 2026-08-18, and this is the largest
  change this re-specify makes.** The human directed the shape: *"the api is used for sync/backup
  and for auth"*, and *"there's an online db for all accounts auth and workspaces association."*
  So an API service is **this effort's to design**, and the control-plane question decision 03
  was to weigh — build it or buy a hosted identity service — is answered in favour of building.

  **What is still excluded, and the line is narrower than it was:** nothing is *deployed* by this
  effort, and no production environment, domain, or operational surface is stood up here. The
  API is designed, and how it reaches users is a later effort's. *Why this is not a silent scope
  expansion: it is written here as a struck exclusion with the direction quoted, so a reader can
  see exactly what moved and who moved it.*
- **The domain model.** Contract statuses, payment rules, unit assignment and the Saudi identity
  forms are untouched.
- **Everything in [[efforts/work-the-surfaces-cannot-do/spec]] (#487).** It is still out of
  scope — but **it was built *before* this effort, not after, and it is complete as of
  2026-08-18.** *Corrected 2026-08-18: this line used to read "deliberately built after this
  one", which is now false in the only direction that matters.*

  **The declared edge was wrong rather than violated.** Its tickets #492, #493, #494 and #495
  each carried `blocked-by: #497` and every one of them shipped without a single platform
  decision being made — because none of them needed one. The dependency was asserted when
  this effort was expected to run first and was never tested; the tracker is the record that
  it did not hold. So the standing warning under decision 09 changes direction: those four are
  **landed code to re-read against whatever 09 produces**, not unbuilt work waiting on it.

  Three things it landed are now inputs to this effort rather than exclusions from it, and each
  is written where it lands: a durable `history` table, a whole-workspace export and import, and
  server-side list filtering. They are the reason this spec was re-opened on 2026-08-18.

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
- ~~**Real users other than the author run the published releases**, so the installed base is a
  population rather than a machine.~~ **Withdrawn by the human 2026-08-18, and false.** It was
  stated by the human on 2026-08-17 and it was load-bearing for a day.

  **Checked rather than merely withdrawn**, because it had shaped four sections: every running
  install polls `latest.json` on the newest release, and that asset on `v0.13.0` has two
  fetches, both from the session that went looking. Nothing has ever asked this application for
  an update. `v0.10.1`'s 39 installer downloads spread evenly across all six platforms with
  exactly one download per `.sig`, which is a scraper; `v0.11.0` and `v0.11.1` have none.

  It is struck rather than deleted because the requirement, criterion, Constraint and Risks it
  produced are all still visible in this file's history, and a reader who finds them without
  this line will not know why they were ever written. **This is the assumption doing its job**:
  it was recorded as an assumption rather than absorbed into a requirement, it named what
  depended on it, and when it fell the blast radius was already written down.
- **Every hosted-workspace user has, or will create, a Google account.** Follows from directing
  sign-in to Google on 2026-08-17. It is an assumption rather than a fact because nobody has
  checked it against the actual user base, and for a Saudi rents tracker it is plausible without
  being established. A local workspace is unaffected — it needs no account of any kind.
- ~~**Record identity is assignable independently on two replicas.**~~ **Never written down, and
  false — added and struck in one line, 2026-08-18.** It was never stated because nothing in a
  single-writer local file made it a question; it was load-bearing under every hosted decision
  regardless. Every primary key is a bare rowid taking the next id above the highest in use, so
  two replicas agree on the id and disagree on the record. It is struck rather than omitted
  because a reader who does not see it here will assume, as this spec did, that identity is
  somebody else's problem. *Risks* has the consequence and decision 11's question 2b tests it.
- **Turso stays the vendor.** No alternative has been evaluated, and this effort does not
  evaluate one.
- **Rust remains present on the desktop client.** Credential handling assumes it
  ([[rules/drive]], under *Client boundary*); a browser client would not have it, which is why that is an
  open question rather than an assumption.

# Open Questions

- **Where does a workspace credential live on a client with no Rust process?**
  [[rules/drive]], under *Client boundary*, puts credentials in Rust and says there is no second place
  they could be. A browser client has no Rust at all. Nothing here requires answering it for a
  browser client that is not being built — but the seam has to admit an answer.
- **What does an offline client do when its token is revoked or expires?** Decision 01
  established that revocation is bulk-only, rotates every token in the group, and has no
  published propagation time. What an already-connected or offline replica does when its token
  is invalidated is undocumented.
- **What does a genuinely offline first launch do**, before any successful connect has happened?
  The documented path wants the remote reachable on first connect, which a fresh install on a
  disconnected machine does not have.
- ~~**Is three days the session window, or a placeholder?**~~ **Answered 2026-08-18 by the
  human: it is a requirement, and it comes with its mechanism.** Three days without any contact
  ends the session; any connection inside the window renews it and restarts the window. Now
  requirement 15, checked by acceptance criterion 16. What is *not* settled by that answer, and
  is decision 03's: what the session actually is on the wire, and what the client holds while
  offline so that "signed in three days ago" is a fact it can prove rather than a flag it sets
  itself.
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

  **This got materially more important on 2026-08-18, and the respecify recorded only the
  subtraction.** With no installed base, **every user this application will ever have arrives
  through this screen** — there is no population that inherits a workspace and never sees the
  fork. So the first-run choice stops being an edge case for newcomers and becomes the only
  route anyone takes into the product, and requirement 2's *both modes are first-class* is
  decided here in practice whatever the spec says. *Recorded because the withdrawal was written
  up as four strikes and no promotions, and a premise change that only ever removes weight is
  a premise change that was read in one direction.*
- ~~**Where does ADR 0001 live now?**~~ **Resolved 2026-08-17.** It is
  [[rules/api-layer]], under *One database client type*, restored from `.claude/decisions/` in history and verified
  against the tree first: `memory.ts` does build its client through `createDatabase`, and
  `seed.ts`/`purge.ts` are still on `drizzle-orm/better-sqlite3`, so the rule's obligation and
  its named exclusion both still hold.

# Risks

- **Two replicas of one workspace assign the same record ids, and nothing in the schema
  prevents it** *(found 2026-08-18, verified in the tree)*. Every table's primary key is
  `integer('id').primaryKey()` — a bare SQLite rowid, with no `AUTOINCREMENT` anywhere in the
  schema or the migrations — so a new row takes the next id above the highest in use. The
  application says so in its own code and relies on it: `importWhole` reads `max(id)` for all
  five concepts (`src/lib/workspace/router.ts:260-276`) and renewal reads `max(contract.id)`
  (`src/lib/contract/router.ts:443`), whose comment states the rule outright — *"The engine's own
  rule is the next id above the highest in use."*

  Against a local file that is correct and always has been. Against **two disconnected replicas
  of one hosted workspace it is a guaranteed collision**: both compute the same next id for
  different records, and under last-push-wins one insert overwrites the other. **Two payments
  become one payment**, with no contention, no shared record, and nothing to point at. It is
  strictly worse than the case decision 11 was written to measure, and it needs no user to do
  anything unusual.

  It shows up as a ledger that is short by however many records the losing device created
  offline. **This does not decide the gate on its own** — every remedy is known and none is
  exotic — and as of 2026-08-18 it is also no longer expensive: the remedy changes the identity
  of every row in a schema **that nothing is running**, so it costs a schema change rather than
  a migration over other people's data. See decision 11, question 2, which measured it live.

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
- ~~**The update that reaches existing machines is the highest-consequence moment in this
  effort.**~~ **Struck 2026-08-18 — it was the largest risk here, and it is gone.** It reached
  no machines. It said the update arrives unprompted on machines holding real rent records, and
  that requirement 16's key rewrite would mutate every row and every reference on a populated
  database with no user watching — showing up not as a crash but as **a workspace that opens
  fine and is quietly wrong**. Every word of that followed from the installed-base assumption,
  and the assumption is withdrawn.

  It is struck rather than deleted because it is the reason the identity work was sequenced
  first and sized largest, and because **the failure mode it names is still real** — it is
  simply no longer reachable by this route. If this application ever ships a change to identity
  *after* it has users, this risk comes back exactly as written, and the cheapest way to keep
  that knowledge is to leave it here legible rather than to recover it from history.

  **What is left in its place is smaller, and it is not nothing** *(resized 2026-08-18, after
  the migration was restored)*. The keys still change over a populated workspace, and
  acceptance criterion 1 requires exactly that to be demonstrated — so the migration is written
  and must be correct. What shrank is who pays for a defect: **one test run rather than a
  stranger's ledger.** The failure mode is unchanged and still the worst shape available here —
  a workspace that opens fine and is quietly wrong, with a `history` table that has no foreign
  key to catch it — and it is now *cheap to discover*, which is a different thing from being
  acceptable to ship. Treating it as gone rather than as resized is how it would come back.
- **Two permanent modes double the surface every decision has to answer for**, and the second
  mode is the one nobody is excited to build. It shows up as local-of-record quietly rotting —
  a path that still compiles, is never exercised, and breaks in a release nobody tested it in.
  The mitigation belongs in the testing strategy `/plan` writes, and it is the reason acceptance
  criteria 7, 8 and 12 name both modes explicitly.
- **Identity and backup shared one provider, and ~~one of them may be leaving~~ one of them is
  leaving.** *Realised 2026-08-18: decision 07 retires Drive sync.* The application keeps a Google
  dependency for authentication while deleting the feature that dependency was originally built
  for. It shows up as a user asked to connect Google for a Drive backup they no longer get, or as
  **an OAuth scope set that outlives its justification and nobody prunes** — which is now a
  concrete obligation on the retirement rather than a hazard: the Drive scopes go when the Drive
  code does, and the sign-in scopes stay.
- **A local workspace's off-machine route is now manual, and nothing warns a user who is not
  exporting.** *Added 2026-08-18 with the retirement.* Drive was automatic, continuous and
  retained; the export is a thing a person remembers to do. It shows up as a lost laptop costing
  everything since the last export, which was never a risk while Drive was running. **The
  mitigation is requirement 6** — converting to hosted — and the risk is what remains for a user
  who does not.
- **Requiring a Google account excludes whoever does not have one**, and unlike the account
  requirement generally, this one cannot be answered with "then use local mode" for a user who
  specifically wants their workspace on two machines. It shows up as a user who wants the product
  and cannot have it for a reason unrelated to rent.
- **Turso's schema-propagation feature is deprecated for new users** — the one feature built for
  exactly the per-workspace shape this effort chose. It shows up at decision 06 as an absence
  rather than an obstacle.
- ~~**Nine open decisions are a lot of unresolved architecture for one spec.**~~ **Four, as of
  2026-08-18 — 06, 07, 09 and 12, plus a narrow remainder on 03.** Counted off the `Status:`
  lines rather than recalled. The risk is **reduced rather than discharged**: a plan still
  cannot be written while 06 and 07 are open, since one decides who owns a hosted schema and
  the other decides whether a whole Rust surface survives. What has changed is that it is no
  longer *several sessions* of unresolved architecture, and the sizing floor no longer rests
  on the count.

  *The sentence also ended "which is why the sizing below reports the top floor", and there is
  no sizing section in this file. [[skills/specify]] reports the floor per turn; it was never
  written here. A cross-reference to a section that does not exist is the cheapest kind of
  defect to leave and the most annoying to meet, so it is removed rather than repaired.*

# Architecture

**This section was partial and is now mostly whole.** *Written 2026-08-17, extended 2026-08-18
after the human directed the shape.* It used to cover only what held whichever way decision 11
landed, because the control plane, the data path and the credential model were all downstream of
the gate. They are no longer: the human settled them directly, and what remains downstream of
decision 11 is **whether the chosen sync client can deliver what this architecture asks of it**,
not what the architecture is. Decisions 06, 07 and 12 are still absent rather than omitted.

## The shape, as directed

**Three tiers, and the middle one is never in the data path.**

1. **A workspace database per workspace, hosted on Turso.** Of record remotely, replicated
   locally. Offline-capable clients — desktop today, mobile later — hold a replica and sync
   **directly** with Turso. *Why not through the API: every read and write would cross
   infrastructure this repository operates and pays for, to add nothing the vendor is not
   already doing.*
2. **A control-plane API and its database, built here.** Accounts, Google sign-in, workspace
   records, membership, workspace-database creation, and **minting the token a client syncs
   with**. Always-online clients — the control-plane dashboard site — read and write through it
   directly, because it already holds the credentials that make that possible.
3. **The desktop client**, which is what exists today, gaining a mode and a session.

**One shape of the client is fixed by decision 11's run rather than chosen: the sync client is
given its remote URL as a function, never as a string.** Passed as a string to a remote that
cannot be reached, `connect()` throws and leaves no usable local database — so a fresh install
on a disconnected machine is dead. Passed as a function that answers `null` until online, it
opens, takes writes, refuses to push with a message naming its own reason, and pushes those
writes when the network arrives. It costs nothing and it is invisible until the day it matters,
which is why it is written here rather than left to be rediscovered.

**The API is in the credential path continuously and in the data path never.** That single
property is what makes the recommendation work, and three requirements land on it:

- **Requirement 15 is enforced by token lifetime rather than asserted by the client.** Tokens are
  short-lived and refreshed against the API. A client that cannot reach the API cannot renew,
  and when its token expires it cannot sync — local work continues, replication stops. *Why this
  matters: a three-day window implemented as a client-side flag is a window the client can
  simply not close. Implemented as a TTL, the client cannot fake it, because the thing it needs
  is issued elsewhere.*
- **Revocation gets an answer the vendor does not give.** Decision 01 established Turso's own
  revocation is bulk-only and rotates every token in its group, with no published propagation
  time — unusable for removing one member. **Declining to renew is per-user and takes effect at
  the next refresh**, which is a bound this repository sets rather than inherits.
- **A second client kind stops being a rewrite.** An always-online client needs no vendor SDK
  and holds no workspace token; it uses the API. An offline-capable one syncs direct. The seam
  differs by whether a client can go offline, which is the real distinction — not by which
  device it runs on.

**The cost, accepted knowingly: permissions on a shared workspace are coarse.** A disconnected
client holds a credential good for its whole workspace database for the length of its offline
window, so **membership grants full workspace access and roles govern administration only**.
Fine-grained per-record permissions and offline writes are mutually exclusive; routing data
through the API would not fix it, only move the enforcement point to a server the offline client
is by definition not talking to. This is decision 05's first shape, chosen.

*Rejected, and named so it is not re-proposed:* **all data through the API.** It buys enforceable
fine-grained permissions and vendor independence, and costs this repository the convergence
engine and the offline write queue — the work decision 10 chose its client specifically to avoid
— plus the infrastructure usage the direct path exists to avoid. It is the right answer only
where fine-grained permissions outrank offline writes, and requirement 7 says they do not.

## Identity comes before all of it

**Nothing above is safe while two replicas can assign one id.** Requirement 16, and it is
upstream of the data path rather than part of it: route sync through Turso and two records merge;
route it through the API and the convergence code has to invent an identity scheme anyway.

**A record's identity is a UUIDv7 held as `TEXT`, generated on the client that creates the
record.** *Chosen by the human 2026-08-18 from four options; the alternatives and their costs are
decision 13.* Time-ordered, so inserts stay sequential and index locality behaves like the rowid
it replaces; generated with no coordination, so it works offline by construction, which is the
property per-device ranges cannot offer without putting the API back in the write path.

**One scheme covers both modes, and it is migrated onto a populated workspace** — also the
human's choice, over leaving local rowids alone and re-identifying at conversion. What it costs
is in *Risks* and in acceptance criterion 1, and **it is the largest single piece of work on
this effort.**

*Struck 2026-08-18 on the grounds that there are no existing installs, and restored the same
day.* The strike was right that no stranger's machine takes this migration and wrong that
nothing does: criterion 1 requires a populated pre-effort workspace to survive into the release
carrying this scheme, so the migration is written, and written in full. **What genuinely did
change is the blast radius, not the obligation** — a defect here now costs one test run rather
than a stranger's ledger, which makes it cheaper to discover and no more acceptable to ship.

**It deletes code rather than adding it**, which is worth stating because it is the one cheerful
consequence: `importWhole` reads `max(id)` for five concepts (`src/lib/workspace/router.ts:260-276`)
and renewal reads `max(contract.id)` and reasons at length about why `last_insert_rowid()` will
not serve (`src/lib/contract/router.ts:435-446`). A client-generated identity is known before the
insert, so both disappear.

## What was settled 2026-08-17 and still holds

Four things are settled by the code that exists, and each was checked in the tree rather than
recalled — re-verified 2026-08-18 against a tree thirty-one commits further on.

**A hosted workspace is a third caller at a seam that already exists.** `createDatabase(single,
batch)` (`src/lib/platform/database/client.ts:47`) takes two functions and returns one
`SqliteRemoteDatabase<typeof schema>`; production passes Tauri's `invoke` (`:61`), tests pass an
in-memory engine (`memory.ts:63`). Whichever client decision 11 selects is **wrapped into those
same two functions**. The gate decides the *body* of `single` and `batch`, never their shape —
which is why [[rules/api-layer]], under *One database client type*, can be obeyed before the gate is known, and why
acceptance criterion 10 is not waiting on anything.

*Rejected, and named so it is not re-proposed:* a second client type for hosted workspaces. It
is the change [[rules/api-layer]], under *One database client type*, exists to forbid, and it would end the property
that makes router tests worth running — that the test client and the production client run the
same row mapping.

**The mode is a third value of a discriminator that is already load-bearing.**
`RemoteSyncProvider` is `Local | GoogleDrive` (`tauri/src/sync/store.rs:32`), `#[default] Local`,
`#[serde(rename_all = "camelCase")]`, mirrored in TypeScript at
`apps/desktop/src/lib/platform/host.ts:79`. *(Corrected 2026-08-18. It read `tauri.ts:37`; #540
moved every payload type out of the facade and into the port, so this effort's own first
shipped ticket is what moved it.)*
Adding a `Hosted` variant is **additive to the serde representation**: an existing install's
persisted store contains `"local"` or `"googleDrive"` and continues to deserialize unchanged.

**This is what makes requirement 1 hold structurally rather than by care**: an install that
knows nothing of this effort deserializes to `Local`, which is exactly what it was, because
`Local` is both the existing value and the default. *Amended 2026-08-18 — this also called it
"the requirement with the highest consequence", which it no longer is, there being no installs
to have consequences for. **The structural property is worth keeping anyway**: it costs nothing
and it is what will make requirement 1 hold for the first real user rather than for a
hypothetical one.*

**Identity is an optional field on a context that is built by defaulting.** ***Built 2026-08-18
by #547, so this is now a description of the code rather than of a plan.*** `Context` was
`{ db, clock, host }` and is now `{ db, clock, host, identity? }`, with `context()` supplying
each dependency from an override or a real capability exactly as before. Identity is a fourth
member that is **absent in the ordinary case**, not an error case — a local-only user never
signs in, and requirement 3 makes that population the one being protected. What a user *holds*
is decision 03's; that the field is optional was already directed and did not wait on the gate.

Three things the build settled that the plan had left open, each because the code forced the
question:

- **The key is omitted rather than set to `undefined`**, so a local request has the shape it has
  always had and no existing procedure has to learn that identity exists.
- **The mode decides, not the sign-in.** Somebody may be signed in to Google with a purely local
  workspace — #543 made signing in its own act — and that person is not *acting as* anybody as
  far as a request is concerned. Identity is present only where the provider is `hosted`.
- **A shell that cannot answer has not said the workspace is hosted.** The read runs while the
  application is still starting, and a client that is not the desktop shell may not offer the
  capability at all; failing to build a context over it would fail the boot of a local workspace
  over an identity it does not have.

**What the build did *not* settle, and it is named where the code is**: the context is built once
at module load, so the identity it resolves is the one the workspace had then. That costs nothing
while nothing can turn a workspace hosted mid-session, and it stops being free at #551 and #553 —
whichever of them creates the transition owns rebuilding the context or restarting.

*Rejected:* a required identity with an anonymous placeholder for local workspaces. Decision 03
already names it as "the harder of the two failures" — it makes every local request carry a
fiction, and the fiction is indistinguishable from a real user at every call site.

# Components

*The unconditional half only. Each row was read in the tree.*

| Component | Where | What changes |
| --- | --- | --- |
| the transport seam | `src/lib/platform/database/client.ts:47` | **Nothing.** It already admits a third caller; this is recorded so it is not "improved" |
| the mode discriminator | `tauri/src/sync/store.rs:32`, mirrored `apps/desktop/src/lib/platform/host.ts:79` | one added enum variant, on both sides of the boundary |
| the flows that branch on it | `src/lib/sync/workspace.ts:32,50,75,84,121,127`; `src/lib/sync/pending-conflict.ts:42` | **seven call sites**, each of which must answer for the third value |
| the request context | `src/lib/api/context.ts:36` and its builder at `:52` | one optional member |
| the host port | `src/lib/api/context.ts:27` | decision 08's inversion, **taken** — declared interface, Tauri facade satisfies it |
| **every primary and foreign key** | `src/lib/platform/database/schema.ts` — **twelve columns**: six `id`, plus `unit.complexId`, `contract.tenantId`, `payment.contractId`, `history.recordId` and both `contract_unit` columns | `integer` becomes `text`, requirement 16. **The widest-reaching change in the effort.** *Corrected 2026-08-18: this listed ten and omitted `unit.complex_id` and `contract.tenant_id`. Counted by generating the migration rather than by reading the file* |
| **the two `max(id)` call sites** | `src/lib/workspace/router.ts:260-276`, `src/lib/contract/router.ts:443` | **deleted.** A client-generated id is known before the insert |
| **the control-plane API** | new, a second package under `apps/` | accounts, sign-in, workspace records, membership, database creation, token minting |
| **the session** | new, desktop side | a short-lived token, refreshed against the API; expiry is what enforces requirement 15 |

**Seven is the whole population, not a sample.** Every site was found by searching for the
discriminator rather than by memory, and the count is recorded so that a later reader can tell
whether the tree has moved under this plan.

**Corrected 2026-08-18, while #544 was being built: seven is the whole population of the *sync
dispatcher*, and there are two more outside it.** `settings/component/sync.svelte:297` labels the
provider and `layout/component/startup-workspace-choice.svelte:155` badges it, and both did it by
elimination — `=== 'googleDrive' ? … : local`. A third value falls into the `else` there, so a
workspace of record somewhere else would have read on screen as one kept on this machine. Both
now name every value. **The count was not wrong about what it counted**; it was read as the whole
population because nothing said what population it was, which is the shape this table exists to
prevent.

**Re-verified 2026-08-18, and this is what that record was for.** Thirty-one commits landed
between writing the table and re-reading it. Six of the seven citations still resolve exactly —
`client.ts:47`, `context.ts:27`, `:36`, `:52`, `store.rs:32`, and all seven discriminator sites
at `workspace.ts:32,50,75,84,121,127` and `pending-conflict.ts:42`. **One moved**: the TypeScript
mirror of the discriminator is `apps/desktop/src/lib/platform/host.ts:79`.

*Corrected again 2026-08-18, and the first correction was wrong.* It read `tauri.ts:76`, which
was a guess at a line inside a file the type had already left: #540 moved every payload type
out of the facade and into the port, and `tauri.ts:56` now only re-exports it. **The row and
the *Architecture* section had been corrected two different ways in one file**, which is worse
than either being stale — a reader checking one and not the other finds a citation that
resolves. Read in the tree, both now say `host.ts:79`. The count of seven is unchanged, and it is still the
whole population.

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
`workspace`, `membership` — with `apps/control-plane/src/tests/schema.test.ts` asserting that the set
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

**Every route but `/health` takes the Google access token as `Authorization: Bearer`, and
`/account/sign-in` was moved onto the same header.** *This corrects #555, one commit later*: it
read the token from a JSON body, which was fine while it was the only route and became two ways
of saying one thing the moment there was a second. There is no session token yet — that is #550's,
and this is what it will replace — so identity is re-established from Google per request. Signing
in is not a precondition for the other routes either: each performs it, so a client whose first
request creates a workspace reaches the account it would have reached.

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

**Permissions are one `INTEGER` column capped at bits 0–52**, per decision 04, and they live on
the membership row in the control plane. That decision was taken against the domain schema's
transports; it applies unchanged here, and the control plane is where it was always going to
land.

# Technical Approach

*Written 2026-08-18 by [[skills/plan]]. **This plans one slice**: requirement 16 and the identity
migration acceptance criterion 1 now requires. The hosted half is not planned here and cannot be
— decisions 06, 07, 09 and 12 are open, and each of them decides something the hosted approach
would have to be written against. What follows waits on none of them.*

## What the migration runner actually permits

Every claim in this subsection was measured against the runner on 2026-08-18, not read off its
name. `apply_migration` (`apps/desktop/tauri/src/database/migrations.rs:125`) is **not a
passthrough**: it parses the whole file with `sqlparser` 0.62's `SQLiteDialect` and executes each
statement **re-emitted through `Display`**. Three consequences, and the second is the one that
would have been found at the worst possible moment.

- **The file is all-or-nothing, and that is free.** A file's statements and its `__migrations__`
  row commit in one transaction, so an interrupted update resumes from the journal. This is what
  acceptance criterion 1's interruption clause rests on — *and it holds only while the identity
  change is **one file***. Split across two, the guarantee is silently gone.
- **`PRAGMA foreign_keys=OFF` does not parse at all.** `Expected: a concrete value, found: OFF`,
  at line 1 column 21 — and because parsing precedes execution, **the entire file is rejected and
  nothing is applied.**
- **So `pnpm db:generate`'s output cannot be applied by this repository.** Run against a schema
  with `text` ids, drizzle-kit 0.31.10 emits exactly the SQLite recreate pattern, PRAGMA pair
  included. That file was generated and fed to the real parser: **rejected whole.** Strip the two
  PRAGMA lines and all **38** statements parse and round-trip faithfully — `CREATE TABLE` with
  backticks, `INSERT … SELECT` with joins, `DROP TABLE`, `ALTER TABLE … RENAME TO`,
  `CREATE UNIQUE INDEX`, correlated `UPDATE`, and `CREATE TABLE … AS SELECT`.

**The PRAGMA was never doing anything here anyway, and that is the more important finding.** This
schema declares drizzle `relations()`, which is a query-layer construct — **not** `references()`.
There is no `FOREIGN KEY` clause in any of the three migrations and none in the database. So:

> **Nothing in this database will catch a bad remap. Not for `history`, and not for anything
> else.** The spec has said for a day that `history` has no foreign key to violate, phrased as
> though the others do. **None of them do** — `contract.tenant_id`, `unit.complex_id`,
> `payment.contract_id` and both `contract_unit` columns are conventions, not constraints. The
> entire burden of catching a wrong remap falls on acceptance criterion 1 and on the tests below.

## Where the identity values come from

**Chosen by the human 2026-08-18, from three options: generated in SQL, inside one migration
file.** Rejected, and named so they are not re-proposed: *a Rust data-migration step journalled
alongside the SQL files* — real UUIDv7 from the `uuid` crate and unit-testable, but it buys a
second migration mechanism, an ordering rule between two kinds of step, and the re-establishment
of an atomicity property option A inherits for nothing; and *registering a `uuid7()` scalar
function on the pool* — which keeps the file declarative but requires the function to exist
forever, since migrations replay on every fresh database, and whose feasibility on sqlx 0.9 was
never established.

**The expression, and it was run rather than reasoned about:**

```sql
printf('%08x-%04x-7%03x-%s%03x-%012x',
       CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536,
       CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536,
       random() & 4095,
       substr('89ab', (random() & 3)+1, 1),
       random() & 4095,
       random() & 281474976710655)
```

Against SQLite 3.50.4 over 5,000 rows: **5,000 generated, 5,000 distinct, 0 malformed**, version
nibble `7`, variant nibble in `[89ab]`, embedded timestamp accurate to 4 ms. `random() & mask` is
used rather than `abs(random()) % n` deliberately — `abs()` on `i64::MIN` raises an integer
overflow in SQLite, and a bitwise mask is total.

`unixepoch(…, 'subsec')` needs SQLite 3.42; the bundled engine is `libsqlite3-sys` 0.37.0, well
past it. **The one-line check belongs in the harness below**, not in a reviewer's memory.

**What the timestamp means for migrated rows, and what had to change because of it.**
*Corrected 2026-08-18, by `/plan`, after `/implement` measured the tree.* Every row that exists at
migration time gets the **same** 48-bit prefix — `unixepoch('now','subsec')` is constant within a
single statement, measured at 1 distinct value across 2,000 rows of one `INSERT … SELECT`. This
paragraph used to say they "sort together" and call that correct. **It is not sufficient.**
`contract/router.ts:799` orders the palette's contract search by `desc(contract.id)` **alone** — a
primary sort, not a tiebreaker — so rows sharing a prefix fall back to whatever follows it, and
with the expression above that is randomness. Migrated contracts would come back shuffled, once,
permanently.

**So the migration mints its ids from the old one rather than at random.** Chosen by the human
2026-08-18 over accepting the shuffle and over rewriting the query:

```sql
printf('%08x-%04x-7%03x-%s%03x-%012x',
       CAST(unixepoch('now','subsec')*1000 AS INTEGER)/65536,
       CAST(unixepoch('now','subsec')*1000 AS INTEGER)%65536,
       0, '8', 0,
       "id")
```

**Everything between the timestamp and the seed is fixed, and that is the whole point.** The first
form tried kept `rand_a` and the variant's low bits random and seeded only the last group — **it
does not work**, because those bits sort *before* the seed. Measured over 2,000 rows: the random
form preserved the old order for none of them, breaking at the very first row; the form above
preserved it for all 2,000, with 2,000 distinct values and none malformed. Old id 1 yields
`01a01462-658c-7000-8000-000000000001` — version nibble `7`, variant nibble `8`, both valid.

**What this costs, and the condition under which it stops being acceptable.** A migrated id is
fully determined by the migration instant and the old rowid, so two *different* workspaces
migrating in the same millisecond with overlapping rowids would mint the same ids. That is
harmless while a migrated workspace never merges with another — and making one workspace out of
two is **decision 12's** (local-to-hosted conversion), which is not planned here. **If decision 12
ever lands, this is the line to revisit**, and the fix is a per-workspace constant in `rand_a`
rather than a zero. Records created *after* the migration are unaffected either way: they come
from the TypeScript generator, which is fully random below the timestamp, and they are what
acceptance criterion 17 is about.

## The migration, in order

One file. The order is load-bearing at three points, each marked.

1. **Build `idmap(concept, old, new)`** from the six concepts that own an identity — `tenant`,
   `complex`, `unit`, `contract`, `payment`, `history`. ⚠ **Before any table is dropped.**
2. **Add the orphans, and this is the case the plan found rather than inherited.** A `history`
   row whose record was deleted points at an id no live row has — legitimately, by design, since
   `history.record` exists precisely so a deleted record still reads. Those references have no
   entry in step 1, so a join would drop them and `record_id` is `NOT NULL`. Minting a fresh id
   per row is also wrong: **two entries about the same deleted record would stop being about the
   same record**, and grouping a deleted record's history breaks. So each distinct orphaned
   `(concept, record_id)` gets **one** new identity:

   ```sql
   INSERT INTO `idmap` ("concept", "old", "new")
   SELECT "concept", "record_id", <uuid7>
   FROM (SELECT DISTINCT h."concept" AS "concept", h."record_id" AS "record_id"
         FROM `history` h
         WHERE NOT EXISTS (SELECT 1 FROM `idmap` m
                           WHERE m."concept" = h."concept" AND m."old" = h."record_id"));
   ```

   The subquery is required: `DISTINCT` over a row containing the generated id would not collapse
   anything, because every row's id differs.
3. **Rebuild each of the seven tables** on drizzle's own `__new_x` pattern — its generated file is
   the starting point and stays the shape of record — but with each `INSERT … SELECT` routed
   through `idmap` instead of copying the old integer.
4. **`history` resolves both of its identities in one statement**, its own and its target, and
   after step 2 both joins are inner:

   ```sql
   INSERT INTO `__new_history` ("id","at","concept","record_id","action","record")
   SELECT hm."new", h."at", h."concept", rm."new", h."action", h."record"
   FROM `history` h
   JOIN `idmap` hm ON hm."concept" = 'history' AND hm."old" = h."id"
   JOIN `idmap` rm ON rm."concept" = h."concept"  AND rm."old" = h."record_id";
   ```

   *`history.concept` is what makes this exact* — the row says which table its target lives in,
   so there is no ambiguity to resolve and no guess to make.
5. **`contract_unit` has no identity of its own.** Both its columns are references and both
   remap; it is the only table where the rebuild is entirely about other tables' ids.
6. **Recreate every unique index**, including the redundant `x_id_unique` on each primary key that
   `0000` established and drizzle still emits.
7. ⚠ **`DROP TABLE idmap` last.** It is the migration's working state and nothing outside the file
   may see it.

⚠ **The two PRAGMA lines drizzle emits are deleted.** They are inert here and they are fatal to
the parser. *This means the file is hand-finished after generation — a documented step now,
rather than something the next person rediscovers by watching a release fail.*

## The runtime half, which the migration does not cover

**With a `TEXT` primary key SQLite stops assigning ids**, so every insert must supply one.
Decision 13 puts generation on the client that creates the record, so a UUIDv7 generator is added
on the TypeScript side and called at each of those sites.

**The inventory below replaces the one this section carried.** *Rewritten 2026-08-18, after
`/implement` claimed this work, converted the schema, read the compiler and stopped.* The previous
version named 18 insert sites and 21 Zod fields. **Both counts are exactly right, and neither is
the work**: converting the twelve columns and twelve schema Zod fields alone raises **35 type
errors across seven files**.

| Surface | Count | Where |
| --- | --- | --- |
| columns `integer` → `text` | 12 | `platform/database/schema.ts` |
| `z.number()` id fields → `z.string()` | 21 | 12 in the schema, 9 in the `complex` and `contract` routers |
| insert sites that must now supply an id | 18 | six routers |
| id-typed `number` / `number[]` annotations | **58** | across `src/lib`, excluding tests and the schema |
| generic constraints over an id | **3** | `design/group.ts:32`, `design/list-keyboard.ts:47`, `payment/payment.ts:24` |
| `Number(page.params.id)` in route pages | **6** | `src/routes/**/[id]/+page.svelte` |
| `Number(…)` coercions in a form | **2** | `contract/component/form.svelte:230,336` |
| `Number.isInteger(id) && id > 0` validity gates | **5** | `complex/query.ts:143`, `history/query.ts:18`, `payment/query.ts:59`, `tenant/component/details.svelte:24,25` |
| `orderBy(… .id)` uses | 19 | preserved by UUIDv7 — one needs care, below |
| numeric id literals in tests | 49 | nine `*.test.ts` files |

*The 58 is counted rather than grepped: a first sweep answered 61, and three of those were
`design/import.ts`'s file row numbers and the carousel's scroll positions, which are not ids.*

**`contract/reconcile.ts` is in that table and appeared in no earlier version of this section** —
`TouchSet`'s two id arrays and `selectAssignmentsForUnits`. It is the file a reader would not
think to open, because it derives state rather than storing any.

**The three generic constraints are mechanical, and that is measured rather than assumed.** They
read as the most alarming row in the table: `TData extends { id: number }` on two shared design
primitives constrains every list and keyboard-navigable table in the application. Reading the
bodies rather than the signatures settles it — `listRows` uses `record.id` only inside a template
literal, `toRecordRows` never touches it at all, and `groupPaymentsByContractId` uses it as a
`Map` key. **All three treat an id as an opaque handle**, and all three behave identically for a
string. They are three signature edits, not a design-system change.

**The validity gate needs a replacement, and that is a decision rather than a translation.**
`Number.isInteger(id) && id > 0` answers *is this a real id yet* while a route parameter is still
resolving, and it distinguishes a malformed id from an absent one. **Chosen by the human
2026-08-18: one shared `isRecordId()`, built on the regex this repository already declares** —
`design/identifier.ts` carries `regex.identifier.uuid`. Rejected, and named so they are not
re-proposed: *plain truthiness at each site*, which stops telling malformed from absent; and
*parsing at the route boundary with Zod*, which restructures six pages for a check that has one
home.

**Ordering by id survives, because UUIDv7 was chosen for exactly that.** Nineteen queries order by
an id, all but one as a tiebreaker after a name or a date, and hex UUIDv7 sorts lexicographically
in creation order. **The exception is `contract/router.ts:799`** — the palette's contract search,
ordered by `desc(contract.id)` alone. It is the reason the migration seeds its ids from the old
ones; *Where the identity values come from* has that expression and what it costs.

**Two call sites are deleted rather than changed**, which *Architecture* already records:
`importWhole`'s `max(id)` reads (`src/lib/workspace/router.ts:260-276`) and renewal's
`max(contract.id)` (`src/lib/contract/router.ts:443`). A client-generated identity is known before
the insert, so the reasoning both of them carry about `last_insert_rowid()` stops applying.

**And two things get simpler, which is worth knowing before reading them as risk.** `importWhole`
loses five `max(id)` reads *and* the contiguous-block allocation they feed — one `newId()` per row
replaces the lot. `complex.create` loses the subquery that names a complex by its unique name from
inside a batch: a client-generated identity is known before the batch is built, so the comment
explaining why it could not be is no longer true and goes with it.

**The order to build it in, because the compiler will not find everything.** Schema first, then
follow the type errors outward; they cover every row of the table above except three. **The route
pages, the five validity gates and the 49 test literals are not all compiler-visible** — a
`Number(…)` coercion produces a `number` that fails at the call site rather than at the coercion,
and a test literal is only caught when the test runs.

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

- **It is Rust's, like every other migration a local workspace has** — requirement 11's second
  half, unchanged, and the half that does not wait on decision 06.
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

A local workspace's migrations stay Rust's, exactly as now — that is requirement 11's second
half, and it is the half that does not wait on decision 06.

The local-to-hosted conversion is **decision 12's and is not planned here.**

# Testing Strategy

*The unconditional half. How each criterion that does not wait on the gate gets checked.*

| AC | Checked by |
| --- | --- |
| 1 | **Manual, unavoidably so, and not met.** Install the last pre-effort release, populate it, update through the real updater. No CI run substitutes for it. **Rehearsed 2026-08-18 on `v0.12.0` → `v0.13.0` — a pair containing none of this effort's changes**, so the procedure is proven and the criterion is not. It is discharged only at this effort's release. Three things stay open: the plugin's own check-download-relaunch, a Drive link surviving an update, and the real subject |
| 2 | A search of the tree for a workspace list or switcher, returning nothing; plus that `RemoteSyncState.workspace` is still singular and `Database::FILENAME` still `"app.db"` |
| 10 | A search of the tree finding one database client type, and the existing router tests still passing over `createMemoryDatabase()` unchanged — the second being the real check, since it is what a forked client type would break |
| 11 | `src/lib/api/tests/context.test.ts`, which already exists, covering a request carrying identity **and one carrying none** — the second being an ordinary local-workspace request rather than an error case |
| 12 (local half) | The existing Rust migration tests, still passing **unchanged**. Unchanged is the assertion; a passing rewritten test proves nothing here. *Note 2026-08-18: the identity migration adds a new Rust migration and its own tests — that is additive, and does not license rewriting the existing ones* |
| 16 | A test that **moves the clock rather than waiting**: sign in, disconnect, advance past three days, and the application asks for a sign-in; repeat with one reach inside the window, and it does not. It is a clock test because `Clock` is already injected into the context (`src/lib/api/context.ts:36`), so no new seam is needed for it |
| 17 | Two clients, separate directories, both disconnected, each creating records the other has never seen, both synced — then a count per concept, `history` included. **Written first as a failing test against the rowid schema**, so the collision is demonstrated before it is fixed |
| 14 | A search for "there is no server" returning only text that is still true when read. Decision 09 owns the rewriting; this is how the result is checked |

**The mode nobody is excited to build is the one that rots** — *Risks* says so, and it is why
criteria 7, 8 and 12 name both modes explicitly. The mitigation belongs here: **every criterion
above is a local-mode criterion**, and all of them are runnable today, before a line of hosted
code exists. Running them early is what keeps local-of-record from becoming a path that still
compiles and is never exercised.

**Two criteria in this table cannot be automated at all** — 1 entirely, and the tree searches in
2, 10 and 14 only partly. They are named so a green suite is not mistaken for a met spec.

## The Rust migration tests do not exist

*Found 2026-08-18 by [[skills/plan]], reading the tree rather than the spec.* Acceptance criterion
12 promises a local workspace's migrations are *"demonstrated by the existing Rust migration tests
still passing unchanged"*, and the row above says *"Unchanged is the assertion; a passing rewritten
test proves nothing here."*

**There are no Rust migration tests.** `database/migrations.rs` and `database/mod.rs` contain no
`#[test]` or `#[tokio::test]` at all; the only tested file under `database/` is `proxy.rs`, whose
eight tests are about value conversion. **So criterion 12's cheap half cannot be run, and has
never been run.** It reads at review as the part already covered, which is the worst way for a
criterion to be wrong.

**This is not an argument for weakening the criterion.** It is the criterion that guards the one
mechanism this whole effort's local half rests on, and the identity migration is about to become
the largest thing that mechanism has ever carried. What changes is that **building the harness is
part of this work rather than an assumption about it**, and criterion 12's `unchanged` starts
meaning something the day after it exists.

**What the harness has to do**, and each item is derived from something measured above rather than
from good practice in general:

| Check | Why it is here |
| --- | --- |
| Apply the real migration files to a fixture database through the **real `migrations::run`** | The runner parses and re-emits every statement; a test that executes the SQL directly tests something the application does not do |
| Assert every generated id matches the UUIDv7 grammar — `[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}` | The identity lives in a `printf` format string, which is the one real cost of the chosen option. This is what pays it back |
| Assert count per concept is identical across the migration, and all ids distinct | Acceptance criterion 1, mechanised |
| Assert every reference resolves — including `history.record_id` **and** that orphaned entries still group by their target | Nothing in the database will catch any of this, and the orphan case is the one the plan had to invent |
| Assert `unixepoch('now','subsec')` is supported by the bundled engine | A version floor is worth one assertion and no reviewer's memory |
| Assert the identity change is **one file**, and interrupting it leaves the workspace untouched | The all-or-nothing guarantee is a property of one file, not of the migration |
| Assert migrated rows come back in the order their rowids had | `contract/router.ts:799` sorts a user-facing search by id alone, and the seeded expression is what preserves it. A regression here is invisible in every other query |

**It does not replace acceptance criterion 1.** The harness runs against a fixture; criterion 1
runs a real installed build through a real updater, and *Testing Strategy*'s note that two criteria
cannot be automated at all still stands.


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
| **The `Hosted` enum variant and its seven call sites** | **No, and this is the item the old reasoning got right.** Seven branches answering for a value nothing constructs is dead code with a test suite. It waits on the gate |
| **The optional identity member on `Context`** | **No**, for the same reason, and acceptance criterion 11 makes it sharper: a test covering "a request carrying identity" cannot be written while nothing can carry any |
| **Decision 09's rule re-scoping** | **No, not yet.** Scoping a rule to local workspaces requires knowing what a hosted one does, which is 11's and 05's |
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

## 10 — grilling(persistence): which client, and whether offline-first survives

Status: **decided — option A, and the contingency is discharged 2026-08-18.** Decision 11 ran
against a live account and came back a go, so option A is no longer conditional. Its price is
still what *Drift found* records; what changed is that the fallback is no longer needed.
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 01 (resolved)

**Chosen: `@tursodatabase/sync`.** It is the only path that keeps the offline-first Constraint
whole without this repository writing its own convergence, and it is where the vendor is taking
the requirement. The choice is **contingent** rather than settled: decision 11 confirms it can
target a database this application can actually create, and confirms the fallback is real before
the fallback is needed. If 11 comes back against it, option B is the fallback.

**Option A's price rose again on 2026-08-18, and not because of the vendor.** Last-push-wins
was weighed here as a conflict-resolution policy — bad, knowingly accepted. The finding recorded
under *Risks* is that this schema hands it a conflict it was never weighed against: two
disconnected replicas assign identical ids to unrelated records, so "last push wins" silently
merges two records rather than resolving one. **Nothing about that is option A's fault** — B and
D meet it too, and D meets it while this repository is the one writing the merge. It does not
re-rank the four options; it means the ranking was never the whole question. Decision 11's
question 2b is where it is settled.

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
lands squarely on the reasoning of *Undo* in [[rules/data]].
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

Status: **decided 2026-08-18 — the gate ran, and it is a GO.** Every question below is
answered against a live account; the evidence is
[[efforts/a-workspace-follows-its-user/evidence/prototypes/turso-sync-against-a-live-database]].

**What it settled, in one line each.** A `libsql://` database this application creates through
the Platform API is a valid sync target (1). Two disconnected replicas creating unrelated
records collide on the primary key, silently, and one payment is simply gone (2b) — while the
same experiment with client-assigned `TEXT` keys keeps both, which confirms decision 13
against the engine rather than against reasoning. Contended loss is **per column, not per
row** (2a), which is materially better than this decision assumed. An offline first launch
works **only where `url` is passed as a function** rather than a string (3). Rotating the auth
token costs 63 bytes — identical to not rotating — so the whole short-lived-credential model
holds (5). The reconcile pass sends **zero bytes** and is followed by one batched push (6).

**Requirement 7 is met.** A replica accepts writes with no network and pushes them when the
network returns. Nothing found here ends the hosted half of the effort.

**What changed on 2026-08-18: the architecture stopped waiting on this and this stopped deciding
it.** The human directed the shape directly — Turso carries workspace sync, the API owns identity
and mints the credential, permissions are coarse — so decisions 03 and 05 are no longer blocked
here, and 11 confirms that the chosen client can serve an architecture that is now written rather
than choosing one. **It remains a go/no-go**, because requirement 7 is unchanged and a client
that cannot write offline still ends the hosted half. It also gained a question the directed
architecture created: number 5, token rotation, which the whole credential model rests on.

As of 2026-08-17 it is a **go/no-go on the hosted architecture**, not a confirmation: requirement 7 is hard, option C is
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
2. **What last-push-wins actually does to a losing writer's record — and it now has two halves,
   the second of which was missing** *(reshaped 2026-08-18)*.

   **2a, the contended case, as originally written.** Two devices, same workspace, both offline,
   both editing one contract, both pushing. Whether the loss is per statement, per row, or per
   field decides whether this is survivable for a payments ledger, and it decides how much of
   the reasoning of *Undo* in [[rules/data]] survives.

   **2b, the uncontended case, and it is the one that is guaranteed.** Two devices, same
   workspace, both offline, each creating a record the other has never seen — one records a
   payment in Riyadh, one records a different payment in Jeddah — both pushing. **The schema
   gives them the same id**, because every primary key is a bare rowid and a new row takes the
   next above the highest in use (*Risks*, and the code cited there). So this needs no shared
   record, no contention, and no unusual behaviour: it is what two people using the product
   normally produces. Record what survives the push and what is gone.

   **Run 2b first.** It is cheaper to set up than 2a, it fails harder, and if it fails there is
   no reading of 2a that rescues the architecture as the schema currently stands. Both are
   acceptance criterion 9.

   **If 2b is confirmed lost, this stops being a client question.** No choice among Turso
   products fixes two replicas agreeing on an id; the remedies all live in this repository's
   schema — client-assigned identity that does not collide, ranges partitioned per device, or a
   composite key — and each is a change to the identity of every row in a database already
   populated on real machines. **That collides with requirement 1**, which is why it is named
   here before the gate runs rather than discovered inside it. It is a return to
   [[skills/plan]] with a schema question, not a swap of one client for another.
3. ~~**What a genuinely offline first launch does** with `bootstrapIfEmpty` false — the documented
   path requires the remote reachable on first connect, which a fresh install on a disconnected
   machine does not have.~~ **Answered 2026-08-18, and the option named here does not exist.**
   `bootstrapIfEmpty` is not in `@tursodatabase/sync` 0.7.2; the question it was asking is real
   and the answer is conditional. A `url` passed as a **string** to an unreachable remote fails
   at `connect()` and leaves no usable local database. A `url` passed as a **function returning
   `null` until online** opens, accepts writes, refuses to push with a message naming its own
   reason, and pushes those writes once the network arrives. **This is a constraint on how the
   client is written**, and it is invisible until the day it matters.
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
5. **Can the client's auth token be rotated without re-bootstrapping the replica?** *(added
   2026-08-18, and it is new work the directed architecture created.)* The whole credential
   model rests on **short-lived tokens refreshed against the API** — that is how requirement 15
   is enforced by a lifetime instead of a client-side flag, and how removing a member takes
   effect (*Architecture*, decision 05). It assumes the sync client will accept a replacement
   token for a replica it is already holding, and **nothing establishes that**. If a rotation
   forces a re-bootstrap, every refresh re-downloads the workspace, and short-lived tokens go
   from being the mechanism to being unaffordable — which would put the three-day window back to
   being something the client asserts about itself.

   *Why it is a gate question rather than a research one: decision 01's evidence covers token
   scoping and revocation from the documentation; this is behaviour under rotation, which only
   running it establishes.*
6. **What a reconcile pass costs over the wire.** The whole-table pass runs at every application
   start and both paths write one `UPDATE` per changed row, sequentially awaited. With a
   documented per-commit added-latency ceiling, this is the number that decides whether the
   architecture is usable before anything is built on it.

Throwaway code goes to `src/lib/prototype/` and is deleted ([[rules/module-layout]], under *Prototype code*); the
write-up is what is kept.

### What it needs to run

*Written 2026-08-17, so the run needs no further decisions once credentials exist.*

Two values in **`apps/desktop/.env`**, which is gitignored and is therefore where they belong.
They are **deliberately not added to `.env.example`**, because that file is tracked and
advertising configuration for an architecture this decision may reject would be premature.

*Corrected 2026-08-18, when the run needed them: this said `.env` and cited `.gitignore:15`.
The file that exists is the app's, not the repository root's, and root `.env` is ignored at
line 7. The run used `apps/desktop/.env` and both values were read from there.*

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
5. **Question 2b, then 2a** — two client instances against one database, in separate
   directories, both disconnected, both pushed. **2b first**: each creates a record the other
   has never seen, and the answer is how many records exist afterwards. **2a second**: both edit
   one contract, and the answer is whether the loss is per statement, per row, or per field.
   This is acceptance criterion 9 and it decides how much of the reasoning of *Undo* in
   [[rules/data]] survives. A negative 2b stops the run here and returns to [[skills/plan]] with
   a schema question — there is no point pricing 2a against a schema that is about to change.
6. **Question 5** — mint a short-lived token, sync, let it expire, mint a replacement and hand it
   to the client already holding the replica. Record whether it resumes or re-bootstraps, and how
   much it transfers when it does. **This is the question the credential model rests on**, and it
   is cheap once question 1 has produced a database.
7. **Question 6** — seed with `pnpm db:seed` for a realistic set, then run a whole-table
   reconcile against the remote and time it. Both reconcile paths write one `UPDATE` per changed
   row, sequentially awaited, against a documented per-commit added-latency ceiling — so this is
   a number, and the number decides whether the architecture is usable.

   **Time the whole-workspace import too** *(added 2026-08-18)*. It did not exist when this
   procedure was written: #536 landed a five-sheet import that resolves every reference before
   the write and then issues the whole thing as **one batch**, measured in the running
   application at 5,000 tenants, 10 complexes, 80 units, 941 contracts and 591 payments. That is
   a single transaction of roughly six and a half thousand statements, and it is also the shape
   decision 12's local-to-hosted conversion would most naturally reuse — so its cost against a
   remote is a number this effort needs whether or not conversion ends up using it. Sync bills
   4 kB frames even for a one-byte row (decision 01), which prices it a second way.

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
- **Question 6 returns an unusable number** — the architecture may survive with reconcile
  reshaped, which is a return to [[skills/plan]] rather than an end. Record the number; do not
  design the fix inside the prototype.

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
`Math.floor(permissions / 2 ** bit) % 2`. `apps/control-plane/src/permission.ts` is written that
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

**A local workspace's migrations do not move.** Rust applies them at launch from
`tauri/migrations/`, exactly as today; [[contexts/desktop/persistence]] is unchanged for
local-of-record, and acceptance criterion 12 holds this decision to that in as many words.

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

**Question.** A hosted remote of record makes Drive redundant as a sync mechanism while leaving
it plausible as a user-owned backup. Whether it survives, becomes an export path, or is retired
decides the fate of a large and carefully-built Rust surface — the manifest, conflict analysis,
retention, the link session — and of [[rules/drive]] entire, every section of it —
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
2. **[[rules/drive]] is superseded, not scoped.** *Concurrency* and *Transport testing* describe a
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
say what the seam admits, because *Client boundary* in [[rules/drive]] — "credentials belong in Rust
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
| [[rules/drive]], under *Concurrency* | concurrency detected rather than prevented, argued from Drive offering no compare-and-set |
| [[rules/drive]], under *Client boundary* | credentials in Rust, which a browser client does not have |
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
| [[rules/drive]], *Client boundary* | **Holds, and generalises beyond Drive** — it outlives its file | moves |
| [[rules/drive]], *Concurrency* | ~~Holds, scoped~~ **Retired with the transport it describes** *(2026-08-18)* | deleted, with its reasoning recorded |
| [[rules/drive]], *Transport testing* | ~~Holds, scoped~~ **Retired the same way** *(2026-08-18)* | deleted, with its reasoning recorded |
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
retires the rest of [[rules/drive]], and this section moves rather than going with it.

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

Status: **decided 2026-08-18 — a row-by-row copy through the existing client seam, ids carried
verbatim, and the mode flips only after the copy verifies.** *Opened 2026-08-17, when local
workspaces became permanently first-class. Taken under the standing instruction above.*
Part of: a-workspace-follows-its-user
Type: grilling
Blocked by: 03 *(was 11 and 03; 11 decided 2026-08-18)*

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
  [[rules/drive]], under *Concurrency*, exists to reason about and was never designed to survive.
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
sync mechanisms on one workspace — the shape [[rules/drive]], under *Concurrency*, was never
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
