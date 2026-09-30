---
status: resolved
blocked-by: [55]
---
# refactor(tauri): the organization becomes a plugin

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization` becomes one plugin whose handler lists its sub-concepts' commands; Rust names follow `<sub-concept>_<act>` and IPC names drop the plugin prefix (plan, *Tauri IPC*); the link arrival moves from `lib.rs`'s `arrive` to the plugin's `on_event(Ready)` or stays in the app `.setup`, never a plugin `setup`. `every_organization_command_names_its_gate` reads the plugin's handler, and `roles.test.ts` records the new strings.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [x] `organization` is a plugin; `lib.rs` names none of its commands (criterion 9). Verified: `organization/plugin.rs` registers all 52 organization commands as `organization_<sub>_<act>` with IPC names `<sub>_<act>`; `lib.rs`'s `generate_handler!` holds only `upgrade::record::earlier_find` and `earlier_read`, and the frontend's only bare invoke strings are those two; `acl.rs` and `every_organization_command_names_its_gate` (now reading `plugin.rs` and `rename`) pass. The child's before-and-after comparison: all 52 invoke pairs match its map, argument shapes unchanged.
- [x] A link launch while closed still shows the window: a test where one can reach it, and the human check at the close. Verified: `links_are_received_once_the_window_and_the_state_exist` passes: in `lib.rs`, `.setup(` precedes `handle.manage(AppState` precedes `arrival::receive(app)`, and no `src/*/plugin.rs` receives links; the link arrival lives in `organization/invitation/arrival.rs`, still called from the app's `.setup`. That the window shows on a link launch while closed is held for the human check at the close (the mock runtime cannot observe it).
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, integrated over ticket 41: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `646 passed; 0 failed; 11 ignored`, check 0, eslint 0, vitest 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test.

## Relevant areas

- `tauri/src/organization/`, `tauri/src/lib.rs` `arrive`, `src/lib/organization/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
