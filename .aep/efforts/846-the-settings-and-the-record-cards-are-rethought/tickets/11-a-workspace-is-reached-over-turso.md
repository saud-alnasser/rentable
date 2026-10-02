---
status: open
---

# feat(desktop): a workspace that is not open is reached over Turso

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The Rust half of the plan's *A workspace that is not open*: the pipeline client generalised into `organization/workspace/remote.rs`, and the `workspace_query` and `workspace_batch` commands with their refusals.

## Acceptance Criteria

Traces requirement 15 and criterion 15 at the shell.

- [ ] Against the loopback server: a statement goes to the signed record's hostname with the member's token.
- [ ] Values map as `database/proxy.rs` maps them, for integers past 2^31, reals, text, null and blobs.
- [ ] A batch runs between `BEGIN` and `COMMIT` and rolls back on a failing step; a single statement with transaction control is refused.
- [ ] Refusals: no grant, a schema newer than this build, a schema behind it (*open it once on this machine*), and unreachable, each with its sentence; a 401 or 403 collects again once.
- [ ] No file is created in the data directory by either command.
- [ ] The lease and backup still pass their tests over the moved client; `cargo test` passes.

## Relevant areas

- `apps/desktop/tauri/src/organization/lease/apply.rs`, `apps/desktop/tauri/src/organization/backup.rs`
- `apps/desktop/tauri/src/organization/workspace/{mod,command,remote}.rs`, `apps/desktop/tauri/src/database/proxy.rs`
- `apps/desktop/tauri/src/sync/test/server.rs`

## Constraints

- [[rules/credentials]]: the credential never leaves Rust; the caller names a workspace id, never a host.
- No changeset: nothing a person sees changes until ticket 13.
