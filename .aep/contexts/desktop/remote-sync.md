---
paths:
  - apps/desktop/tauri/src/machine/**
  - apps/desktop/tauri/src/sync/**
  - apps/desktop/tauri/src/turso/**
  - apps/desktop/tauri/src/http.rs
  - apps/desktop/src/lib/sync/**
use-when: "the request touches signing in, or the credential a workspace replicates under"
---

# Remote sync

Getting a workspace off this machine and back onto it. **Three subjects share the machinery**: the
member a person signs in as, the credential the member's vault unsealed for the workspace, and the
replica that syncs under it. *It read "the identity a person signs in as, the session that identity
is issued, and the workspace credential" until 2026-09-12, when the control plane and Google
sign-in retired with [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]: an
organization on the customer's own Turso account answers everything the two answered for, and
`[[contexts/desktop/organization]]` is where the organization itself is described.*

> **Google Drive sync is gone** (#554, 2026-08-19). Decision 07 of
> [[efforts/a-workspace-follows-its-user/spec]], directed by the human on 2026-08-18: it is dropped
> in favour of Turso sync. The transport, `DriveFiles`, the manifest, conflict analysis, retention,
> the link session, the whole conflict surface and every string that named them are deleted, and
> so are the Drive OAuth scopes.

> **Google sign-in and the control plane are gone** (2026-09-12). Requirement 19 of the
> organization effort, and last on purpose: until everything above it landed, the control plane
> was the only thing that signed anybody in. `sync/google/`, `sync/sign_in.rs`, `sync/session.rs`
> and `sync/control.rs` are deleted, with the keyring services they filed under left to age out;
> the provider-neutral OAuth core in `sync/oauth/` survived, because the Turso consent drives it,
> and effort 840 moved it into the Turso adapter as `turso/oauth/`.
> What the control plane knew about Turso survived as `packages/turso-platform`, imported by
> nothing, until effort 840 removed it on 2026-09-28.

> **Local backup is gone** (#569, 2026-08-19). Requirement 17 of
> [[efforts/a-workspace-follows-its-user/spec]], directed by the human: Turso holds the record and
> carries its own point-in-time restore, so the application keeps no snapshot files.
> *Narrowed by effort 838, requirement 13: a copy is taken again, only before a change of shape
> (a workspace migration, an organization's format), read out row by row by `tauri/src/backup.rs`
> rather than copied as a file; nothing restores it in the application.*

## Language

**Sign in**:
A password opening a member's vault on this machine, with or without a network. A _machine_ has
joined one or more organizations; a _member_ is signed in to one of them or nobody is. Nothing is
issued by anybody: what the password opens is what the member holds.
_Avoid_: "account", which was Google's row until the retirement. The organization and the member
are the two things a person is signed in as.
*Corrected 2026-09-14 ([[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
requirements 12, 18 and 22): a password signs a member in once per machine; the derived key is
then remembered in the keyring and every later launch resumes on it, until the member signs out
here, is signed out from another machine, or the machine is disconnected. `sign in` and `sign
out` are the member; `connect` and `disconnect` are the machine and the organization; the owner's
consent is named below, and the Turso account is the only thing called an account.*
*Corrected 2026-10-01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
requirement 3): the owner's consent is `connect Turso`, the title of the step that asks for it,
and the one button under that title says connect. `forget Turso account` is still how the owner
gives the authority back.*
*Corrected 2026-10-05 ([[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]],
requirements 1 to 9): a machine holds several organizations and one is open at a time. The wall's
switcher picks which, signed out; adding one is the first run or a link, and removing one forgets
that organization alone. From effort 825 to 851 a machine held one organization or none, and
reaching another meant disconnecting first.*

**Credential**:
The Turso token a replica syncs with. Sealed to the member's public key on a `grant` row in the
organization database, unsealed by the vault at sign-in, held on `RemoteSync` for the run of the
process and nowhere else. Minted by the owner's machine, which holds the Turso authority, for four
weeks, and re-sealed to every standing grant when renewed. **A credential is per database rather
than per member**, which is the revocation radius: a lock-out rotates a workspace's and every
member of that workspace collects a fresh one.
_Avoid_: "the session", which was the control plane's window and had a clock of its own. A
credential has an expiry and nothing else measures it.

**Dispatch**:
Pushing what this machine wrote and pulling what the others wrote. It is what `syncWorkspaceNow`
does and what the sync manager schedules, and since the retirement nothing stands in front of it.
_Avoid_: calling the last dispatch of a session a replication: it pushes and does not pull.

**Refusal**:
Turso saying no to a dispatch, read at the response (`turso/platform/mod.rs::read_sync_refusal`).
The account's, for quota or billing, is said to the owner in Turso's own words and to everybody
else as the account needing attention; the credential's, a `401` or `403`, is what the reconnect
collects a fresh credential on. A machine that reached nothing is neither, and needs a different
sentence from both.

## Boundaries

- **The workspace credential is unsealed, held in this process, and never written down.** The
  vault unseals it at sign-in; it lives on `RemoteSync` for the run of the process and nowhere
  else, because the next launch opens the vault again. The URL is a fact rather than a credential
  and is persisted, because it is what lets a machine open its replica offline.
- **The replica's file is named for its workspace, never for the machine.** One member signing out
  and another signing in would otherwise open the second's replica over the first's rows. `app.db`
  stays what the seeded and test paths use; a workspace is `ws-<id>.db` beside it, and the
  organization's own replica is `org-<id>.db`.
- **A pull that brought rows is announced, and that is what makes the query cache safe.** Derived
  state is computed from rows, so rows from another device can make a status that was right wrong;
  the dispatch reconciles fully and then invalidates the cache at its root. It is the fourth writer
  [[rules/data]], under *Query cache*, enumerates, and the enumeration being complete is the whole
  of what `staleTime: Infinity` rests on.
- **A replica is kept indefinitely, and the grant is what keeps it.** *Directed by the human
  2026-08-20, and the organization is where it started to matter.* It is not deleted on sign-out
  and not on a timer: somebody who signs out is usually about to sign back in, and re-pulling a
  whole workspace to serve that is a cost nobody asked for. What ends a replica is the member it
  was held for holding no grant on that workspace any more, which the startup path reads off the
  session the vault opened. **Every other outcome keeps it**, because deleting somebody's ledger
  over a bad connection is the worst mistake available here. Removal reaches into nothing a
  machine already holds; requirement 14 records the limit.
- **What this machine holds is tracked, and the tracking is reconciled at startup.** Each replica
  records the workspace and the member whose grant keeps it, because a machine can hold replicas
  for several members and a replica is only checkable while that member's vault is open. The
  startup pass drops entries whose files are gone; it deletes nothing. The tracking is this
  machine's record, `remote-sync.json`, kept by `tauri/src/machine/` (`sync/store.rs` until effort
  840, when the record left `sync`, and the replication, the rename and the Turso consent's
  commands moved to `organization` under the same command names).
  *Since effort 851 the record holds `heldOrganizations` and `selectedOrganization`, each entry with
  its own Turso organization, last workspace and `name_signed` and `lock_marked` latches, and every
  replica entry names its organization. It still writes `organization` and the top-level
  `tursoOrganization` as copies of the selected entry, so a build from before reads the selected
  organization intact, and never the key `organizations`, which those builds take for the shape
  from before 2026-09-13 and forget. The Turso organization a consent was granted over while it
  waits for the organization it will belong to is written under `pendingTursoOrganization`, a key
  of its own, because the top-level copy cannot hold it while the selected organization has one
  (requirement 39); a record written before that key reads it from the top where it differs from
  the selected organization's. A record an earlier build wrote is converted in place at load
  (`machine/record.rs`, `sanitize`, against release 0.19.0's record, frozen as
  `machine/test/released.json`). Opening a workspace judges only the open organization's
  replicas, and only the open organization replicates. Removing an organization (`forget_one`)
  deletes that organization's replica files, remembered key, entry and Turso consent and nothing
  else; until 851 the forget swept every `org-*` and `ws-*` file on the machine.*
- **A replica that has never pulled has no schema, and the application says so rather than failing
  on the next statement.** Opening does not block on a pull, which is requirement 7, but a first
  run has nothing to read until one succeeds, so the startup path pulls once and then asks whether
  the replica is ready.
- **A replica found damaged is set aside and pulled again, once.** *Effort 838, requirement 17,
  Firefox's practice.* Where the engine says a replica, a workspace's or the organization's, is not
  a database or is corrupt, or where the file is shorter than its own header says (turso reports a
  truncated file as neither, and some cuts hang its open), `Database::open_replica` renames the file
  and every sidecar to `<name>.corrupt-<ms>`, keeps them, logs `replica.corrupt.setAside` naming
  them and that anything not yet sent from it is lost, and opens the replica again empty; the first
  pull fills it as it fills a new one. A second failure is refused as any open is. Damage the
  engine reports by its kind (`Corrupt`, `NotAdb`) after the open writes `<name>-damaged` beside
  the replica and logs `replica.corrupt.found`; the next open finds that marker and sets the
  replica aside the same way. What is watched for it is the proxy's single and batch statements
  and the organization store's own `query` and `execute`, on a `corrupt::Watched` connection, and
  every push and pull. `Database::is_replica_ready`, `OrganizationStore::found`,
  `lease_connection` and `install` read the engine's connection unwatched. The not-a-database
  words are read at the open alone, since a failed push or pull is flattened text that may carry
  the server's own. A file cut short beside the sync engine's `<name>-replace-base-apply` marker
  is left to the engine, which restores it from its backups at the open. `database/corrupt.rs`
  holds what counts as damaged and the measurements behind it.
- **A refused credential is collected again, and nobody is told to do anything.** When a dispatch
  comes back refused as the credential's, the shell pulls the organization replica, reads the
  member's grants again, hands the sync engine whatever moved, and tries the same dispatch once
  more. It is the whole of a remaining member's recovery after a lock-out.
- **A refused account is said as the account's, and every read and write goes on.** Requirement 25
  and requirement 18 together: the sync state records the refusal until a dispatch goes through,
  the workspace page says it in the reader's own terms, and the local replica serves everything
  meanwhile.
- **Credentials belong in Rust and never cross the IPC boundary.** The consent's OAuth is Rust's,
  the `state`, the PKCE verifier and the code exchange never leave the process, and what a caller
  can ask for is an outcome rather than a step of the protocol. What a vault holds never crosses
  either; [[rules/credentials]], under *Client boundary*. *2026-09-14: the remembered member key
  is a keyring entry Rust alone reads and writes, and the replicate the sync heartbeat dispatches
  pulls the organization replica first, pushes what this machine wrote to it (which is what
  carries out a sign-out made with no connection; 2026-09-15), and ends a session whose epoch the
  row has moved past, answering a standing the wall reads.* *Since effort 846 (requirement 10) it
  also ends a session this machine was signed out of alone: its `machine_sign_out` row above the
  `machine_signed_out` mark `remote-sync.json` keeps, which only a sign-in takes. The same check
  is made at the resume and before every act, an act refused for it putting the wall up at once
  (ticket 24). A heartbeat that ends nothing writes this machine's sealed `machine_name` where it
  differs and its `seen_at` at most hourly, and pushes what it wrote;
  [[contexts/desktop/organization]] has the sign-out of one machine whole.* *Since effort 851
  (requirement 14) the Turso consent is each organization's own: the keyring service
  `rentable.turso-platform` files it under the account `org:<organization id>`, and `owner`, the
  one account every consent used to share, is now only where a consent waits until its organization
  exists. The first launch of this build moves a consent an earlier build left there to its
  organization (read, set, read back, then delete; `upgrade/consent.rs`), after the old-shape check
  and before the resume.*
- **A flow is one command, and the interface observes it rather than sequencing it.** The caller
  asks to sign in, join, or restore and gets back the state that resulted; it does not open a
  session, poll it, redeem a code and hold the pieces in between. A flow outstanding for as long
  as a person takes reports its progress on an event, because one call cannot return twice.
- **Network clients are built in one place**, `tauri/src/http.rs`. reqwest carries no crypto
  provider here, deliberately, to keep one provider in the tree, so a client built any other way
  panics rather than failing. This is why there is a builder for a two-line construction.
- **Nothing here writes a workspace file but the copy before a migration.** The old backup's
  retirement is why `Database::create_backup` and `Database::restore_backup` are gone rather than
  merely refused on a replica. What an update leaves behind is a version number and a release
  URL, in `update/`. The member holding a workspace's migration lease writes a copy of it, read
  over the pipeline in one transaction, to `backups/ws-<id>/` before the first statement
  (`organization/lease/`, `backup.rs`), and one on the owner's account where that machine is
  the owner's; a copy that cannot be taken releases the lease and applies nothing.
