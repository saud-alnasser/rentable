---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: context
paths:
  - tauri/src/sync/**
  - tauri/src/backup/**
  - tauri/src/http.rs
  - src/lib/sync/**
use-when: "the request touches backup, Google Drive, linking, or conflicts"
---

# Remote sync

Getting a workspace off this machine and back onto it. Two subjects share the machinery:
local backup, and exchange with Google Drive.

## Language

**Link**:
Connecting a workspace to a remote account, and the OAuth session that performs it. A
workspace is _linked_ or _unlinked_.

**Autosync**:
The push to the remote scheduled after a successful mutation. Remote, like every use of
_sync_.

**Manifest**:
The index describing which snapshots exist and which one is current. Exists in a local form
and a remote form, and the two are reconciled separately. **Derived, never a source of
truth** — the snapshots are, and a manifest that is lost or overwritten is rebuilt from the
ones actually present ([[rules/drive-concurrency]]).

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
