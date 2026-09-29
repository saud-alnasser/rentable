---
status: open
---
# fix(tauri): the application's window plugin is not replaced by Tauri's own

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (correctness, confirmed against tauri 2.12.0): ticket 53 registered the application's window plugin as `"window"`, the name of Tauri's own core window plugin, which `register_core_plugins` registers and which replaces ours by name before plugins initialise; the ACL still passes against our manifest, so `plugin:window|drag`, `restart` and the maximize toggle reach Tauri's commands and fail or differ. The plugin takes a name of its own, every frontend invoke and the capability follow, and a guard fails when any feature plugin takes the name of one of Tauri's core plugins.

## Acceptance Criteria

Traces requirements 9 and 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 9 and 19.

- [ ] No feature plugin is named after a Tauri core plugin (path, event, window, webview, app, resources, image, menu, tray), and a test in `src/guard/` fails when one is (criterion 9).
- [ ] Every frontend window call reaches the application's own command with its old behaviour: drag, restart, the maximize toggle, close through `destroy` (criterion 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/window/`, `tauri/capabilities/default.json`, `src/lib/platform/tauri.ts`, `tauri/src/guard/acl.rs`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
