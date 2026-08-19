---
aep: 2.7.0
owner: repository
date: 2026-08-19
kind: context
paths:
  - apps/desktop/tauri/src/sync/**
  - apps/desktop/tauri/src/http.rs
  - apps/desktop/src/lib/sync/**
use-when: "the request touches signing in, or the session a workspace replicates under"
---

# Remote sync

Getting a workspace off this machine and back onto it. **Two subjects share the machinery**: the
identity a person signs in as, and the session that identity is issued — the window this machine
may go on replicating inside.

> **Local backup is gone** (#569, 2026-08-19). Requirement 17 of
> [[efforts/a-workspace-follows-its-user/spec]], directed by the human: Turso holds the record and
> carries its own point-in-time restore, so the application keeps no snapshot files.
> `tauri/src/backup/` and its manifest, the snapshot commands, the settings control and the
> strings that named them are deleted. What the updater took a protected snapshot for is
> answered by the record being remote rather than by a replacement file.

> **Google Drive sync is gone** (#554, 2026-08-19). Decision 07 of
> [[efforts/a-workspace-follows-its-user/spec]], directed by the human on 2026-08-18: it is dropped in favour of
> Turso sync. The transport, `DriveFiles`, the manifest, conflict analysis, retention, the link
> session, the whole conflict surface and every string that named them are deleted, and so are
> the Drive OAuth scopes.
>
> **What survived, and why it could**: sign-in, because sign-in is Google rather than Drive. #543
> separated the two acts first, which is what let the deletion take the link session without
> taking identity with it. The profile read moved the same day the transport went — it had been
> going through Drive's own `about` endpoint, and it goes to OpenID Connect's `userinfo` now
> (`sync/google/profile.rs`).

## Language

**Sign in**:
Establishing who somebody is, and the OAuth session that performs it. A _machine_ is signed in
or it is not, and at most one identity is held.

**Account**:
The person Google vouched for, as a row this application keeps. **The row outlives the
credentials deliberately** — signing out drops the credentials and keeps the row, so the surface
can say what it is waiting for rather than showing a machine that has never seen anybody.
`needsReconnect` is the status that means *this machine no longer holds this identity*.

**Subject**:
Who Google says somebody is — the OpenID `sub` claim, and what the control-plane API keys an
account by. `RemoteSyncAccount.provider_user_id` carries it.
_Avoid_: treating it as interchangeable with what that field held before 2026-08-19, which was
Drive's `permissionId` — the same person under a scheme nothing here speaks any more

**Session**:
How much longer this machine may go on replicating without hearing from the control plane. **A
lifetime that was issued elsewhere, never a claim this application makes about itself** — the
control plane sets the moment and refuses a credential past it, so a client cannot extend its own
window by believing in a later one. Reaching the control plane at any point inside the window
restarts it from the reach, up to the absolute lifetime it was signed in under. A build that was
never told where a control plane is has none, because there is nowhere to sign in.
_Avoid_: calling it a sign-in — signing in is the act, and the session is the three days it is
worth. And _avoid_ "the session token" for anything on the TypeScript side, which never holds one

**Window**:
The three moments a session is measured by, and the earliest one governs. The *refresh window* is
how much longer this machine may work without reaching the control plane; the *replica credential*
is how much longer the token the replica syncs with lives; the *absolute lifetime* is when the
sign-in itself dies and no refresh extends it. They are started by different calls — a refresh
moves the first alone, a mint restarts the first two, and **nothing moves the third** — so they are
three numbers rather than one, and treating any two as one is how a client comes to replicate on a
credential that has died, or to work a year under a sign-in that ran out in a month.
_Avoid_: calling the refresh window the session's expiry. Passing it does not end the session —
past it the application locks and a returning network lifts the lock with nobody typing anything,
which is the whole difference between a gate and a sign-out.

**Dispatch**:
Reaching the control plane and reading back what this machine may still do. It is what
`syncWorkspaceNow` does, what the sync manager schedules, and it is **not a transfer**: a replica
pushes its own writes.
_Avoid_: calling it a sync in prose about the client. Nothing is exchanged on this call

## Boundaries

- **Signing in is one act with no second half.** It establishes an identity and touches no
  workspace. That was the point of separating it from linking a folder in #543, and the folder is
  gone; what an identity is *for* is the session the control plane issues against it, which the
  sign-in flow asks for immediately afterwards and treats as best-effort.
- **Signing out keeps the account row and drops the credentials.** A machine that has signed out
  is waiting on a person rather than broken, and the row is what lets it say so.
- **The sign-in asks for `openid`, `email` and `profile`, and for nothing else.** `openid` is not
  decoration beside the other two: the control-plane API identifies an account by the `sub` claim,
  and that claim is *undefined* in a plain OAuth 2 grant rather than merely absent. A Rust test
  fails if it is dropped, and another fails if a Drive scope ever comes back — an application that
  deleted Drive does not go on asking for somebody's files.
- **An account nothing links is an identity, not litter.** The reconcile that runs on every state
  read used to delete exactly those, which was consistent while signing in *was* linking. It does
  not any more, and the guard is a test rather than a comment: the failure it prevents is a
  sign-in undone by the next state read, which is invisible without a second read.
- **The session's expiry crosses to TypeScript and the session's token does not.**
  [[rules/credentials]], under *Client boundary*. Rust holds the session token in the platform
  credential store, under a service name of its own rather than beside Google's, and
  `RemoteSyncState` carries the moments — facts *about* a credential rather than one. **The window
  is persisted rather than held for the run of the process**, because requirement 15 is three days
  and not three days of one sitting: a window that started again at each launch would ask a
  disconnected user to sign in on the second morning, while the control plane would still have
  renewed it.
- **Renewing is something the application does, not something the control plane offers.** The
  dispatcher reaches the control plane before it decides anything, and the sync manager schedules
  that on a timer and on the machine coming back online. **Being unable to reach it is not a
  failure** — the window stays where it was and the client goes on until it closes on its own —
  where a *refusal* is the opposite and gives the session up. A client that treated the two alike
  would sign somebody out for being on a train.
- **Credentials belong in Rust and never cross the IPC boundary.** OAuth is Rust's — the `state`,
  the PKCE verifier, the code exchange, token refresh and the profile read never leave the
  process — and what a caller can ask for is an outcome rather than a step of the protocol.
- **A flow is one command, and the interface observes it rather than sequencing it.** The caller
  asks to sign in and gets back the state that resulted; it does not open a session, poll it,
  redeem a code and hold the pieces in between. A flow outstanding for as long as a user takes
  reports its progress on an event, because one call cannot return twice — and a coarse command
  owns its own abandonment, so cancelling is a second command rather than a returned value.
- **Network clients are built in one place**, `tauri/src/http.rs`. reqwest carries no crypto
  provider here — deliberately, to keep one provider in the tree — so a client built any other way
  panics rather than failing. This is why there is a builder for a two-line construction.
- **Nothing here writes a workspace file any more.** Backup was the last thing that did, and its
  retirement is why `Database::create_backup` and `Database::restore_backup` are gone rather than
  merely refused on a replica. What an update leaves behind is a version number and a release
  URL, in `update.rs`, and no copy of anything.
