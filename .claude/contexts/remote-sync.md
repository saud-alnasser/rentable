# Remote sync

Sources: `tauri/src/remote_sync/`, `tauri/src/backup/`, `src/lib/api/utils/remote-sync-google-drive.ts`, `src/lib/resources/sync/`

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
and a remote form, and the two are reconciled separately.

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
- **Backup is local, sync is remote, and both produce snapshots.** A change to snapshot
  shape touches both — neither owns the format alone.
- **A remote operation holds a lock.** Two clients writing one workspace is the failure
  this domain exists to prevent, not an edge case to handle afterwards.
