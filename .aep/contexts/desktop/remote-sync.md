---
paths:
  - apps/desktop/tauri/src/sync/**
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
> the provider-neutral OAuth core in `sync/oauth/` survived, because the Turso consent drives it.
> What the control plane knew about Turso survives as `packages/turso-platform`, imported by
> nothing.

> **Local backup is gone** (#569, 2026-08-19). Requirement 17 of
> [[efforts/a-workspace-follows-its-user/spec]], directed by the human: Turso holds the record and
> carries its own point-in-time restore, so the application keeps no snapshot files.

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
out` are the member; `connect` and `disconnect` are the machine and the organization; `connect
Turso account` and `forget Turso account` are the owner's consent, and the Turso account is the
only thing called an account.*

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
Turso saying no to a dispatch, read at the response (`sync/turso/platform.rs::read_sync_refusal`).
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
  stays what the seeded and test paths use; a workspace is `workspace-<id>.db` beside it, and the
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
  startup pass drops entries whose files are gone; it deletes nothing.
- **A replica that has never pulled has no schema, and the application says so rather than failing
  on the next statement.** Opening does not block on a pull, which is requirement 7, but a first
  run has nothing to read until one succeeds, so the startup path pulls once and then asks whether
  the replica is ready.
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
  row has moved past, answering a standing the wall reads.*
- **A flow is one command, and the interface observes it rather than sequencing it.** The caller
  asks to sign in, join, or restore and gets back the state that resulted; it does not open a
  session, poll it, redeem a code and hold the pieces in between. A flow outstanding for as long
  as a person takes reports its progress on an event, because one call cannot return twice.
- **Network clients are built in one place**, `tauri/src/http.rs`. reqwest carries no crypto
  provider here, deliberately, to keep one provider in the tree, so a client built any other way
  panics rather than failing. This is why there is a builder for a two-line construction.
- **Nothing here writes a workspace file any more.** Backup was the last thing that did, and its
  retirement is why `Database::create_backup` and `Database::restore_backup` are gone rather than
  merely refused on a replica. What an update leaves behind is a version number and a release
  URL, in `update.rs`, and no copy of anything.
