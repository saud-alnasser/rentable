# Remote sync

Sources: `tauri/src/remote_sync/`, `tauri/src/backup/`, `tauri/src/http.rs`, `src/lib/api/utils/remote-sync-google-drive.ts`, `src/lib/resources/sync/`

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
ones actually present (ADR 0005).

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

- **Credentials belong in Rust and never cross the IPC boundary.** This is the constraint
  the whole domain is being reshaped around, and it is half met. OAuth itself is Rust's:
  the `state`, the PKCE verifier, the code exchange, and token refresh never leave the
  process, so no refresh token reaches the web layer through linking or through a Drive
  call. What remains is the client secret, still returned by the config command and now
  read by nobody, and an account-auth command with no caller. #118 withdraws both.
- **Every Drive request is issued by Rust — but nothing asks for one yet.** `DriveTransport`
  attaches the bearer credential, retries, and maps a refusal onto the typed error;
  `DriveFiles` is every operation issued over it — listing, upload, download, delete, the
  folder, manifest, and head resolutions built from them, and the read of the account the
  token belongs to. That last one acts on no file, and it lives there anyway: what makes the
  boundary is being a request this application issues, not the kind of thing it names, and
  a second request-issuing type would divide the surface a caller has to hold. What is
  still missing is a caller: no Tauri command reaches either, so the requests that actually
  run are the TypeScript client's until #118. A Rust Drive layer with no caller is the
  expected state here, not dead code.
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
- **The link session is sequenced in one place, and never by a component.** Authorization
  happens in a browser this application does not control, so a session outstays the screen
  that started it: a result can arrive for a session the user has already replaced, and
  cancelling has to settle the remote as well as the local state. Both are easy to get
  subtly wrong twice, which is what happened. Each entry point constructs that owner and
  consumes it; none of them sequences the steps again. **The owner's lifetime is its host's**
  — a host that can disappear mid-session cancels one, so a screen that starts a link stays
  rendered while a link is possible. The pending _conflict_ is not part of it: it has other
  sources and outlives any session.
- **A remote operation holds a lock, and that lock is in-process only.** It is a field on
  the in-memory sync state: acquiring refuses while one is already held, releasing clears
  it. So it serialises operations inside one running application and nothing more — it
  does not coordinate two machines and does not survive a restart. Two clients writing one
  workspace is therefore not prevented, and is not going to be: Drive offers no
  compare-and-set, so the read before a manifest write is detection rather than a guard,
  and what follows a collision is a repair rather than a refusal.
