---
status: resolved
blocked-by: [52, 24]
---
# refactor(tauri): the plugin machinery lands with diagnostics, window and settings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each of `diagnostics`, `window`, `settings` becomes an inline plugin with its own `plugin.rs` (plan, *Tauri IPC*); `build.rs` derives each plugin's command list from its `generate_handler!` and registers it as an `InlinedPlugin` with `AllowAllCommands`; `capabilities/default.json` gains `"<plugin>:default"`; their TypeScript adapters invoke `plugin:<name>|<command>`.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [x] A Rust test asserts each derived list equals its handler (criterion 9). Verified: `guard::acl::tests::each_plugin_allows_exactly_what_its_handler_answers` passes: it compares `build.rs`'s list, parsed from each `src/*/plugin.rs` `generate_handler!`, with the names each handler matches; the child's scratch rename to `"display"` failed it, and a misspelled `windows:default` in the capability failed the build (`Permission windows:default not found`).
- [x] `diagnostics` registers first; state shared across plugins is managed before them (criterion 9). Verified: `guard::acl::tests::diagnostics_registers_first_after_the_shared_state` passes: both `.manage` calls precede every `.plugin`, then single-instance, diagnostics, window, settings. The log now installs in the diagnostics plugin's setup, slightly before the app's `.setup`, which the plan's *Tauri IPC* asks for (registered first so later failures are recorded).
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `645 passed; 0 failed; 11 ignored`, check 0, eslint 0, vitest 0 (run on its own), validate 0; node tests fail only the date-dependent receipt test. No assertion changed. The running-app checks (settings, diagnostics, window controls, startup window, link launch) are held for the human at the close.

## Relevant areas

- `tauri/src/lib.rs`, `tauri/build.rs`, `tauri/capabilities/default.json`, the three modules and their TypeScript adapters

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Evidence: [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/research/how-a-tauri-feature-becomes-a-plugin]].
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
