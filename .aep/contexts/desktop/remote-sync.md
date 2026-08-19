---
aep: 2.6.0
owner: repository
date: 2026-08-19
kind: context
paths:
  - apps/desktop/tauri/src/sync/**
  - apps/desktop/tauri/src/backup/**
  - apps/desktop/tauri/src/http.rs
  - apps/desktop/src/lib/sync/**
use-when: "the request touches backup, Google Drive, linking, or conflicts"
---

# Remote sync

Getting a workspace off this machine and back onto it. **Three subjects share the machinery**:
local backup, exchange with Google Drive, and — since #550 — the session a hosted workspace
replicates under. The first is not going anywhere; the second is retiring; the third is what
replaces it.

> **The Drive half of this is being retired.** Decision 07 of [[efforts/a-workspace-follows-its-user/spec]],
> directed by the human on 2026-08-18: **Google Drive sync is dropped in favour of Turso sync.**
> Read everything below about the manifest, conflict analysis, retention and the link session as
> a description of code that exists today and is scheduled to go.
>
> **What stays**: local backup and snapshots, which are not Drive's and never were; and the OAuth
> session, because sign-in is Google — the account, the token refresh and the credential boundary
> are load-bearing for identity. **That separation has happened** (#543, 2026-08-18): signing in is
> its own command and linking consumes what it produces, so the deletion can take the link session
> without taking identity with it.
>
> *Recorded as local-only earlier the same day, on a recommendation the human reversed.*

## Language

**Sign in**:
Establishing who somebody is, and the OAuth session that performs it. A _machine_ is signed in
or it is not, and at most one identity is held. Nothing about a workspace follows from it.

**Link**:
Connecting a workspace to a remote folder, under an identity that already exists. A workspace
is _linked_ or _unlinked_.
_Avoid_: using it for the sign-in — the two were one call until 2026-08-18 and the word carried
both, which is exactly why an account could not exist without a folder

**Autosync**:
The push to the remote scheduled after a successful mutation. Remote, like every use of
_sync_.

**Session**:
How much longer this machine may go on replicating without hearing from the control plane. **A
lifetime that was issued elsewhere, never a claim this application makes about itself** — the
control plane sets the moment and refuses a credential past it, so a client cannot extend its own
window by believing in a later one. Reaching the control plane at any point inside the window
restarts it from the reach, up to the absolute lifetime it was signed in under. A build that was
never told where a control plane is has none, because there is nowhere to sign in — which is the
only case left, now that no workspace is of record on this machine.
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

**Manifest**:
The index describing which snapshots exist and which one is current. Exists in a local form
and a remote form, and the two are reconciled separately. **Derived, never a source of
truth** — the snapshots are, and a manifest that is lost or overwritten is rebuilt from the
ones actually present ([[rules/drive]], under *Concurrency*).

**Manifest reconciliation**:
Recomputing a manifest from the snapshot files actually present. The same operation the
contract domain performs on statuses, applied to a different subject.

**Conflict**:
A divergence between local and remote workspace state that needs a user decision.
_Avoid_: overlap — that word belongs to contracts

**Snapshot source**:
Why a snapshot was taken — a user asking for one, an automatic save, or a safety copy made
before a risky operation such as a sync or an update. The source is what a snapshot is
categorised and retained by, not merely a label.

**Retention limit**:
How many snapshots of one source survive. Each source has its own limit, so an automatic
save never evicts the copy taken before an update.

## Boundaries

- **Signing in and linking are two acts, and the ordering between them is a precondition
  rather than a sequence.** A link consumes an identity; where this machine holds none it signs
  one in on the way past, and where it holds one no consent screen opens at all. Nothing on the
  linking path can establish an account, which is what stops linking from quietly becoming the
  only way to have one again — a link named under an identity that is not held is refused.
  Abandoning an attempt undoes what that attempt did and no more: an identity it signed in goes
  with it, an identity it merely used does not.
- **Signing out is not disconnecting Drive.** It drops the credentials and keeps the account row,
  so a workspace still linked stays linked, cannot sync, and says which of the two things to do
  about it — the settings surface already renders that sentence beside a *needs reconnect* badge.
  Removing the row instead would reset the workspace to local on the next reconcile, which is
  disconnecting Drive without being asked to. Disconnecting Drive does give up the identity, and
  that direction is not the same conflation: a person who wants this application to stop talking
  to their Google account is asking for both.
- **The sign-in asks for `openid`, and Drive has no use for it.** It is asked for on behalf of
  the control-plane API, which identifies an account by OpenID Connect's `sub` claim — a claim
  that is *undefined* in a plain OAuth 2 grant rather than merely absent. The scope grants no
  data `email` and `profile` do not already grant, and a Rust test fails if it is dropped,
  because the failure would otherwise land on a server this module never talks to.
  **`RemoteSyncAccount.providerUserId` is not that claim**: it is Drive's `permissionId`, the
  same person under a different scheme. Copying one into the other would make one person two
  accounts.
- **An account no workspace links is an identity, not litter.** The reconcile that runs on every
  state read used to delete exactly those, which was consistent while signing in *was* linking.
  It does not any more, and the guard is a test rather than a comment: the failure it prevents is
  a sign-in undone by the next state read, which is invisible without a second read.
- **The session's expiry crosses to TypeScript and the session's token does not.** The same
  boundary as below, and the split is what makes the window usable at all: the side that decides
  whether to keep replicating needs two numbers, and the side that presents a credential needs
  the credential. So Rust holds the session token in the platform credential store, under a
  service name of its own rather than beside Google's, and `RemoteSyncState` carries the two
  moments — facts *about* a credential rather than one, exactly as `tokenExpiresAt` already was.
  **The window is persisted rather than held for the run of the process**, because requirement 15
  is three days and not three days of one sitting: a window that started again at each launch
  would ask a disconnected user to sign in on the second morning, while the control plane would
  still have renewed it.
- **Renewing is something the application does, not something the control plane offers.** The
  sync dispatcher reaches the control plane on the hosted path before it decides whether to
  replicate, and the autosync manager already schedules that on a timer and on the machine coming
  back online. **Being unable to reach it is not a failure** — the window stays where it was and
  the client goes on until it closes on its own — where a *refusal* is the opposite and gives the
  session up. A client that treated the two alike would sign somebody out for being on a train.
- **Credentials belong in Rust and never cross the IPC boundary.** The constraint the whole
  domain was reshaped around, and it is met. OAuth is Rust's — the `state`, the PKCE
  verifier, the code exchange, and token refresh never leave the process — and the two
  commands that used to hand the web layer a client secret and a refresh token are gone
  rather than quietened, along with every command that exposed a step of the protocol
  instead of an outcome. What a caller can ask for is what it can be told.
- **Every Drive request is issued by Rust.** `DriveTransport` attaches the bearer
  credential, retries, and maps a refusal onto the typed error; `DriveFiles` is every
  operation issued over it — listing, upload, download, delete, the folder, manifest, and
  head resolutions built from them, and the read of the account the token belongs to. That
  last one acts on no file, and it lives there anyway: what makes the boundary is being a
  request this application issues, not the kind of thing it names, and a second
  request-issuing type would divide the surface a caller has to hold. Every flow reaches it
  — linking, unlinking, the syncs this application schedules for itself, the sync that
  follows a link, inspecting what the remote holds, and settling a conflict — and no Drive
  request is issued anywhere else.
- **A flow is one command, and the interface observes it rather than sequencing it.** The
  caller asks for a link and gets back what the remote's contents make possible; it does
  not open a session, poll it, redeem a code, and hold the pieces in between. A flow
  outstanding for as long as a user takes reports its progress on an event, because one
  call cannot return twice. What that costs is the reason it is worth saying: a coarse
  command owns its own abandonment, so cancelling is a second command rather than a
  returned value, and every point the flow can be abandoned at has to be answered inside
  it.
- **A flow that cannot proceed on its own returns the question, and does not raise it as a
  failure.** A sync needing the user is the same answer a link produces — what diverged and
  which way the application leans — and it comes back beside the action rather than as an
  error, because nothing went wrong. Only a caller that can present it has to know about
  it; the ones that cannot see that nothing transferred, which is true.
- **What a flow cannot do for itself is recomputation, and only that.** Derived statuses
  are the web layer's and reached through its own API, so a pull replaces the database and
  the caller recomputes afterwards. That is the whole residue of the coarse boundary where
  a flow has been moved: a caller of one resolves no folder, reads no manifest, and chooses
  no direction, and still owns the derivation. There is no longer a path that does those
  three in TypeScript; recomputation is the whole of what stayed.
- **Serialising this application's own sync requests is the caller's, refusing a second one
  is the lock's.** The lock answers a concurrent operation by refusing, which is right for
  work that must not overlap and wrong for a user pressing Sync while an automatic one
  runs. So the flows queue before they call, and what reaches the lock is already serial.
  **One queue, for every flow** — two of them serialise their own callers and nothing
  between them, which for the collisions that actually happen is the same as none. The
  symptom is not a hang but a `busy` the autosync manager is right not to retry, so a
  second queue reads as a sync that quietly stopped happening.
- **Interpreting what Drive said about a file is not the transport's.** The file record, the
  keys this application carries its own metadata under, and the decoders reading Drive's
  spellings back into values are one subject, and a domain question about a file does not
  reach through the client that issues requests to ask it. Drive draws the same line: a
  file's metadata is what a listing answers with, its content is what a download returns.
- **Reading the remote's index is also what repairs it.** A manifest that is absent,
  unreadable, or overwritten by another client is rebuilt from the snapshots present and
  written back — inside resolving it and inside saving it, never left to whoever called
  them. A caller that has to remember the repair is a caller that forgets it, and the
  failure is silent: an index nobody rebuilt reads as an empty workspace and invites a
  push over work that is still there.
- **The ported Drive logic decides from values, never from the machine.** Conflict
  analysis, manifest reconciliation, and retention selection issue no request and read no
  file, setting, or database — which is what lets each be exercised by calling it. A
  decision needing local state takes it as an argument; the reads that produce it live
  outside that layer, beside the command surface.
- **A 403 from Drive is ambiguous, and the sentence is the only thing that resolves it.**
  Drive refuses "you may not" and "this app was never granted this file" with the same
  status and no machine-readable reason, so a single-file read matches the prose to tell
  them apart. It is the one place this application reads an error message rather than a
  code, and it is deliberate: treating every 403 as fatal turns a scope change into a
  failed sync, and treating every 403 as absent hides a real permission failure behind a
  duplicate folder.
- **A workspace folder is a place in the user's own Drive, so a file is deleted only where
  it declares an origin this application recognises.** A declaration, specifically — a
  snapshot names the source it was taken for and a manifest names its type — and not a
  name. Recognising a file well enough to *read* it is a weaker test than owning it well
  enough to destroy it: a snapshot is found by its filename as well as its properties,
  because that is what finds one written before the properties existed, and a cleanup that
  deleted on the same evidence would take a file that merely looks like ours. Retention
  already refuses to judge a snapshot whose source it cannot read, and a cleanup evicting
  one on the strength of that refusal would make the refusal decorative. Two costs are
  accepted knowingly: a folder this application has emptied is not necessarily an empty
  folder, and a snapshot predating the source property is never evicted.
- **A remote that names a different workspace is intact, and is still not this one's.**
  A folder answering for this workspace while its index names another is the fourth reason
  the user is asked, and neither direction is safe to take on it: pushing overwrites work
  that is not theirs, pulling replaces theirs with it. **The identity is recorded when a
  sync settles and compared on every later reading**, and a disagreement needs both sides —
  a workspace linked before this was recorded has nothing to be wrong about, so it is never
  told to relink on that account. Answering it disconnects and leaves the remote exactly as
  found: emptying a folder on the strength of a conflict that says it belongs to somebody
  else is the deletion this domain refuses to make.
- **A retry may never create a second thing.** `POST` is the one method never issued
  twice, because Drive creates a file by `POST` and a duplicate snapshot is a fault this
  application cannot observe. Any new write path has to answer this question before it
  chooses a verb.
- **Network clients are built in one place**, `tauri/src/http.rs`. reqwest carries no
  crypto provider here — deliberately, to keep one provider in the tree — so a client
  built any other way panics rather than failing. This is why there is a builder for a
  two-line construction.
- **Backup is local, sync is remote, and both produce snapshots.** A change to snapshot
  shape touches both — neither owns the format alone.
- **The link is driven from one place, and never by a component.** Authorization happens in
  a browser this application does not control, so an attempt outstays the screen that
  started it: a result can arrive for an attempt the user has already replaced, and
  cancelling has to settle the remote as well as the local state. Both are easy to get
  subtly wrong twice, which is what happened. Each entry point constructs that owner and
  consumes it; none of them drives the link again. **The owner's lifetime is its host's**
  — a host that can disappear mid-session cancels one, so a screen that starts a link stays
  rendered while a link is possible. The pending _conflict_ is not part of it: it has other
  sources and outlives any session.
- **The pending conflict has one owner, and its lifetime is the application's.** Three things
  raise one — a link the two sides disagree about, an inspection at startup, and a sync that
  cannot proceed on its own — and every screen that can present one presents that same one,
  so resolving, dismissing, and relinking are each written once. **Dismissal is remembered
  against the state the conflict describes**, not against the conflict, and that memory is
  the owner's: a question the user waved away is not asked again until the thing it was
  about has moved, on whichever screen they are on next. What the user does deliberately
  reopens it — pressing Link or Sync asks about now. What each host does _around_ the
  conflict stays its own, so the owner returns outcomes rather than driving anybody's screen.
  **A host whose own work follows the remote's reply hands that work in**, and the question
  stays presented while it runs: settling clears the question once the answer has been acted
  on rather than when the remote replied, so a screen with more to do does not fall back to
  what it shows when nothing is pending for the length of it. It clears either way — the
  remote has acted, so a host whose own work then failed shows that failure and not the
  question again.
- **A remote operation holds a lock, and that lock is in-process only.** It is a field on
  the in-memory sync state: acquiring refuses while one is already held, releasing clears
  it. So it serialises operations inside one running application and nothing more — it
  does not coordinate two machines and does not survive a restart. Two clients writing one
  workspace is therefore not prevented, and is not going to be: Drive offers no
  compare-and-set, so the read before a manifest write is detection rather than a guard,
  and what follows a collision is a repair rather than a refusal.
