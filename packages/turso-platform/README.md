# @rentable/turso-platform

Turso's Platform API and the workspace migration runner, in TypeScript.

**Nothing imports it, and that is deliberate.** The desktop reaches Turso through its own Rust
client (`apps/desktop/tauri/src/sync/turso/platform.rs`), which holds the customer's own
authority; this package is what the retired control plane knew about the same API, kept so a
hosted tier remains possible later without being planned now. It is not on any credential path.

- `index.ts`: `tursoPlatform`, a port over the Platform API (create a database, mint a token,
  delete a database), verified against the published API on 2026-08-18.
- `migration.ts`: the migration runner, which applies `@rentable/workspace-migrations` to a
  workspace database over libSQL's HTTP protocol, one at a time, with a ledger.
- `failure.ts`: the refusal the two raise.
