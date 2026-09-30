---
status: resolved
---
# fix(tauri): the window shows, and its controls answer

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Found on the running app at the close, 2026-09-30: the window never appeared, and the application stopped answering every command. Ticket 53 moved the window commands into the `frame` plugin and kept them synchronous. Tauri runs a plugin's synchronous command on the event loop's thread while it holds the plugin store's lock; `window.show()` there calls `SetWindowPos`, which sends the window a message at once, and the event loop's handler for it asks for the same lock, so the thread waits on itself (the stack: `window_show` > `Window::set_visible` > `SetWindowPos` > `on_event_loop_event` > `Mutex<PluginStore>::lock`). Before the effort the commands were the application's own and held no plugin lock. Every window command is now `async`, as Tauri's own window plugin's are, and a guard fails on a synchronous plugin command that takes a window or the app handle.

## Acceptance Criteria

Traces requirements 9 and 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 9 and 19.

- [x] The window shows at startup and the application answers (criterion 19). Verified: launched from `_run`, the main window is visible and the process responding; before the fix the window stayed hidden, the process did not respond, and `plugin:settings|get` timed out.
- [x] Maximize, restore and a settings read answer through IPC (criterion 19). Verified over the webview's debugging port: `plugin:frame|maximize` twice and `plugin:settings|get` each returned.
- [x] A test fails on a synchronous plugin command that takes a window or the app handle (criterion 9). Verified: `guard::acl::tests::no_plugin_command_that_reaches_a_window_is_synchronous` failed with `window_show` made synchronous again and passes with it `async`.
- [x] The integration gate passes on this commit (criterion 19). Verified: `cargo fmt --check` 0, `cargo test --lib` `651 passed; 0 failed; 11 ignored`.

## Relevant areas

- `tauri/src/window/mod.rs`, `tauri/src/guard/acl.rs`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
