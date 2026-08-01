# rentable

An offline-first desktop tracker for rents payments — one bilingual application, one local
SQLite database, one optional Google Drive backup. There is no server: every layer,
including the one shaped like a backend, runs inside the desktop app.

## Language

**Workspace**:
The unit of syncable state — one local database plus its metadata, mapped to one remote
location.

**Snapshot**:
A point-in-time copy of a workspace database, held as a file. Local backups and remote
copies are both snapshots.

**Reconcile**:
Recompute derived state from its source of truth and write the result back. Always local.
_Avoid_: sync

**Sync**:
Exchange workspace state with the remote. Always remote.
_Avoid_: using it for any local recomputation

**Derived status**:
A status computed from other rows rather than authored by a user. It is stored, but the
stored value is a cache of the derivation and never the authority.

## Boundaries

- **There is no server.** The API layer is a direct caller executing in the webview. The
  only process boundary it crosses is Tauri's IPC into Rust — never HTTP.
- **Credentials never cross the IPC boundary.** Google Drive HTTP and OAuth belong in Rust.
  OAuth is there, and so are the Drive transport and every operation over it — but no
  command calls them yet, so the requests that actually run are still TypeScript's, still
  holding the OAuth client secret from its config. That remainder is a known divergence
  with a ticket (#118).
  Why the client relocates wholly rather than sitting behind a proxy command:
  [ADR 0003](../decisions/0003-drive-client-relocates-to-rust.md).
- **Domain rules live in their concept's own module.** Routers validate, call the domain,
  persist, and reconcile — they hold no rules. There is no repository layer; routers reach
  the database directly (#107, #108).
- **Modules are organised by concept, not by layer**, with `src/routes/` as the
  acknowledged exception (#123–#126).
- **Derived status is written back by reconciliation, never by the mutation that changed
  its inputs.** Any mutation touching contracts, payments, or unit assignments must
  reconcile, or the stored statuses go stale.

## Constraints

- **Offline-first.** The application is fully usable with no network. Remote sync is
  optional and additive, never a dependency of ordinary use.
- **Arabic and English, RTL and LTR.** Both locales are first-class; a layout that only
  works in one direction is broken.
- **Saudi identity documents.** A tenant is identified by a government document whose two
  accepted forms are fixed by Saudi issuance, not by this application.
