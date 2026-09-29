---
status: resolved
blocked-by: [56]
---
# refactor(tauri): lib.rs composes plugins and nothing else

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`upgrade` becomes a plugin; `state.rs` and `AppState` go, each plugin managing its own state; `lib.rs` holds the plugins in order, one line each, with the ordering documented beside it. The Rust module baseline is empty.

## Acceptance Criteria

Traces requirements 5 and 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5 and 9.

- [x] `lib.rs` has no `generate_handler!` and no command path; `state.rs` is gone (criterion 9). Verified: `lib.rs` holds no `generate_handler!`, `invoke_handler` or `#[tauri::command]` (count 0), and `src/state.rs` does not exist; `guard::acl::lib_composes_plugins_and_names_no_command_or_state` passes. Each plugin builds its own state in its setup; `machine::Shared` stays one `RemoteSync` lock shared by sync and organization. A state-building failure still ends the launch with the same `.expect` messages the old app `.setup` panicked with, now before a window appears; the old path showed no screen either.
- [x] The Rust module test's baseline is empty (criterion 5). Verified: `tauri/src/guard/cycle.baseline.txt` holds no line: the last cycle (organization and upgrade) broke through an `Upgrade` port the session defines and the upgrade plugin implements, so only `lib.rs` names `upgrade`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `647 passed; 0 failed; 11 ignored`, check 0, eslint 0, vitest 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test. Assertions changed only in the link-arrival test and `acl.rs`'s plugin list.

## Relevant areas

- `tauri/src/lib.rs`, `tauri/src/state.rs`, `tauri/src/upgrade/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
