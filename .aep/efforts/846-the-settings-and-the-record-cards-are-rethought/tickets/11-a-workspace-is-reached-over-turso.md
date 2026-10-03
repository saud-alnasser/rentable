---
status: resolved
---

# feat(desktop): a workspace that is not open is reached over Turso

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The Rust half of the plan's *A workspace that is not open*: the pipeline client generalised into `organization/workspace/remote.rs`, and the `workspace_query` and `workspace_batch` commands with their refusals.

## Acceptance Criteria

Traces requirement 15 and criterion 15 at the shell.

- [x] Against the loopback server: a statement goes to the signed record's hostname with the member's token. *Verified: `cargo test --lib remote lease backup proxy -- --test-threads=1` printed 53 passed, 0 failed, 1 ignored (the live test); it includes `a_statement_goes_to_the_records_hostname_with_the_members_token_and_leaves_no_file`.*
- [x] Values map as `database/proxy.rs` maps them, for integers past 2^31, reals, text, null and blobs. *Verified: the same run: `values_map_as_the_proxy_maps_them` compares against `execute_single_sql` for 1757000000000, -9007199254740993, reals, Arabic text, null, blobs and bound values.*
- [x] A batch runs between `BEGIN` and `COMMIT` and rolls back on a failing step; a single statement with transaction control is refused. *Verified: the same run: `a_batch_runs_between_begin_and_commit_and_rolls_back_on_a_failing_step` checks order, rollback, and transaction control refused with nothing sent.*
- [x] Refusals: no grant, a schema newer than this build, a schema behind it (*open it once on this machine*), and unreachable, each with its sentence; a 401 or 403 collects again once. *Verified: the same run: `a_workspace_with_no_grant_or_another_schema_is_refused_before_any_request`, `an_unreachable_turso_says_so_naming_the_workspace`, `a_refused_credential_is_collected_again_once`; the behind refusal is the new `workspaceNeedsOpening` (en and ar), and `workspaceBehind` for a read-only reader who cannot open it up to date.*
- [x] No file is created in the data directory by either command. *Verified: the hostname test compares the data directory's file list before and after: unchanged.*
- [x] The lease and backup still pass their tests over the moved client; `cargo test` passes. *Verified: the lease, backup and proxy tests are in the 53 above; the builder's full `cargo test -- --test-threads=1` printed 657 passed, 0 failed, 11 ignored.*

## Relevant areas

- `apps/desktop/tauri/src/organization/lease/apply.rs`, `apps/desktop/tauri/src/organization/backup.rs`
- `apps/desktop/tauri/src/organization/workspace/{mod,command,remote}.rs`, `apps/desktop/tauri/src/database/proxy.rs`
- `apps/desktop/tauri/src/sync/test/server.rs`

## Constraints

- [[rules/credentials]]: the credential never leaves Rust; the caller names a workspace id, never a host.
- No changeset: nothing a person sees changes until ticket 13.
