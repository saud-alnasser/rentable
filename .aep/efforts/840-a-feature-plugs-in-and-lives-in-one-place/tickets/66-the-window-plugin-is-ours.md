---
status: resolved
---
# fix(tauri): the application's window plugin is not replaced by Tauri's own

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (correctness, confirmed against tauri 2.12.0): ticket 53 registered the application's window plugin as `"window"`, the name of Tauri's own core window plugin, which `register_core_plugins` registers and which replaces ours by name before plugins initialise; the ACL still passes against our manifest, so `plugin:window|drag`, `restart` and the maximize toggle reach Tauri's commands and fail or differ. The plugin takes a name of its own, every frontend invoke and the capability follow, and a guard fails when any feature plugin takes the name of one of Tauri's core plugins.

## Acceptance Criteria

Traces requirements 9 and 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 9 and 19.

- [x] No feature plugin is named after a Tauri core plugin (path, event, window, webview, app, resources, image, menu, tray), and a test in `src/guard/` fails when one is (criterion 9). Verified: the application's window plugin registers as `frame` (`tauri/src/window/plugin.rs`), the capability grants `frame:default`, and `guard::acl::tests::no_plugin_takes_the_name_of_a_core_plugin` passes; the child's scratch rename back to `window` failed it with the core-plugin message. The child confirmed against tauri 2.12.0 that only `window` collided (`register_core_plugins` runs after the builder's plugins, and `PluginStore::register` replaces by name).
- [x] Every frontend window call reaches the application's own command with its old behaviour: drag, restart, the maximize toggle, close through `destroy` (criterion 19). Verified: `grep -rn plugin:window| apps/desktop/src` prints nothing; `platform/tauri.ts` invokes `plugin:frame|show`, `hide`, `minimize`, `maximize`, `drag`, `close` and `restart`, and the command bodies (toggle through `is_maximized`, `start_dragging`, `destroy()`, `app.restart()`) are unchanged. Held for the human at the close: drag, the maximize toggle, close, restart, minimize, show, hide in the running app.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `649 passed`, check 0, eslint 0, vitest 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test. No assertion changed.

## Relevant areas

- `tauri/src/window/`, `tauri/capabilities/default.json`, `src/lib/platform/tauri.ts`, `tauri/src/guard/acl.rs`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
