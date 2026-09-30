---
status: resolved
blocked-by: [54]
---
# refactor(tauri): sync becomes a plugin

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`sync` becomes a plugin managing its own state; its TypeScript adapter follows.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [x] `sync` is a plugin; `lib.rs` names none of its commands (criterion 9). Verified: `sync/plugin.rs` registers `sync_state_get` and `sync_push` (IPC `plugin:sync|state_get`, `plugin:sync|push`); `git grep` for `remote_sync_state_get` and `remote_sync_push` finds nothing, and `lib.rs`'s handler names no `sync::` command. The sync plugin runs no setup: `machine::RemoteSync` stays in `AppState` under the one lock the organization also writes, built in the app's `.setup` (ticket 57 removes `AppState`). `remote_sync_replicate` and `remote_sync_rename_workspace` are organization commands (ticket 46) and move with ticket 56.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `645 passed; 0 failed; 11 ignored`, check 0, eslint 0, vitest 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test. The only assertion edit adds `sync` to `acl.rs`'s expected list.

## Relevant areas

- `tauri/src/sync/`, `src/lib/sync/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
