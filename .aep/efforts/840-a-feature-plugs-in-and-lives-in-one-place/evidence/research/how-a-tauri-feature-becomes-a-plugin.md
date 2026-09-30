---
use-when: "turning a Rust feature of the desktop shell into an app-defined inline Tauri plugin, or deciding plugin names, the ACL entries they need, and what has to stay in lib.rs"
---

# Question

With tauri 2.x as locked on `1aa8d6a5`, what exactly must be written so that each Rust feature of
`apps/desktop/tauri` is an inline plugin registered by one `.plugin(x::plugin())` line in
`lib.rs`, and what changes as a result: names, IPC strings, ACL, state, events, tests, cost?

# Sources

Read 2026-09-28. `R/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`.

- **The versions that actually compile.** `Cargo.toml` asks for tauri 2.11.5 and tauri-build 2.6.3,
  but `apps/desktop/tauri/Cargo.lock` on `1aa8d6a5` resolves **tauri 2.12.0, tauri-build 2.7.0,
  tauri-macros 2.7.0, tauri-utils 2.10.0** (bumped in #837). Those were missing locally; I ran
  `cargo fetch --locked` (no tracked file changed) and cite them. I diffed them against 2.11.5 /
  2.6.3 / 2.9.3. Every behaviour below is the same in both. The differences are renames
  (`extend_api` became `run_invoke_handler`), formatting, and a capabilities-validation fix in
  tauri-build.
- tauri: `R/tauri-2.12.0/src/{plugin.rs, app.rs, webview/mod.rs, ipc/authority.rs, state.rs, test/mod.rs, event/event_name.rs}`
- tauri-build: `R/tauri-build-2.7.0/src/{acl.rs, lib.rs}`
- tauri-utils: `R/tauri-utils-2.10.0/src/acl/{build.rs, identifier.rs, resolved.rs, schema.rs}`
- tauri-macros: `R/tauri-macros-2.7.0/src/command/{wrapper.rs, handler.rs}`
- plugins: `R/tauri-plugin-deep-link-2.4.10/src/lib.rs`, `R/tauri-plugin-single-instance-2.4.4/README.md`
- Official docs (fetched through a summariser, so the wording is paraphrased and weaker than
  source): https://v2.tauri.app/develop/plugins/, https://v2.tauri.app/security/permissions/,
  https://v2.tauri.app/develop/calling-rust/
- App: `apps/desktop/tauri/{build.rs, capabilities/default.json, tauri.conf.json, src/lib.rs, src/state.rs}`,
  `src/lib/platform/tauri.ts`, `src/lib/platform/database/client.ts`

# Findings

## 1. `tauri::plugin::Builder`

- **source** The only name check `Builder` makes is that the name is not `core` or `tauri`
  (`plugin.rs:191`, `:728`). The **observation** is that the effective rule comes from the ACL.
  A capability entry `"<name>:default"` is parsed as an `Identifier`. An identifier must start
  with an ASCII alphanumeric, may continue only with alphanumerics or `-`, and may not end with
  `-`. It may not start with `tauri-plugin-`, and the base is at most 64 characters
  (`identifier.rs:95-116`, `:134`, `:153-209`). **An underscore is rejected.** The code accepts
  upper case, even though its error text says "lowercase". The docs say lowercase, digits and
  hyphens only. **conclusion** Names must match `[a-z0-9]+(-[a-z0-9]+)*`, so `remote-sync` is
  valid and `remote_sync` is not.
- **source** `invoke_handler` stores one closure and replaces any earlier one (`plugin.rs:321-325`).
  `generate_handler!` expands to `match cmd { … _ => return false }` (`handler.rs:176`). `Invoke`
  is not `Clone` (`ipc/mod.rs:211`). **interpretation** Because the handler takes `Invoke` by
  value, two generated handlers cannot be chained in one plugin. A plugin has exactly one
  `generate_handler!`, and it may list paths into submodules.
- **source** `setup` takes `FnOnce(&AppHandle<R>, PluginApi) -> Result<…>`, and its doc example
  calls `app.manage(...)` (`plugin.rs:405-440`). `on_event`, `on_page_load` and `js_init_script`
  exist at `:563`, `:483` and `:371`.
- **source (ordering)** `Builder::build` runs `register_core_plugins` (`app.rs:2552`) and then
  `initialize_plugins` (`app.rs:2607`). That call runs each plugin's `setup` in **registration
  order** (`plugin.rs:907`; `register` removes any plugin with the same name, then pushes the new
  one, `:881-883`). The app's `.setup` closure runs later, on `RuntimeRunEvent::Ready`
  (`app.rs:1441-1444`), inside `fn setup`. That function first creates the configured windows
  (`:2688-2692`) and then calls the closure (`:2698`). Plugins' `on_event` receives
  `RunEvent::Ready` after that (`app.rs:1445`, `:2815`).
- **conclusion** A plugin's `setup` can read state that was managed by `Builder::manage` (passed
  in at `app.rs:2425`) or by an earlier plugin's `setup`. It **cannot** read state the app's
  `.setup` manages, and **no window exists yet** when it runs. Registering the same name twice
  silently replaces the first plugin.

## 2. Invoking from the frontend

- **source** `on_message` strips `plugin:` and splits the rest on `|` into plugin and command
  (`webview/mod.rs:2073-2079`). It then dispatches to the plugin's handler
  (`run_plugin_invoke_handler`, `:2126`). The lookup is a linear scan by name, and an unknown
  plugin produces `"plugin {plugin} not found"` (`plugin.rs:986-994`). The docs show
  `invoke('plugin:<plugin-name>|upload', …)`.
- **source** Argument keys are camelCased by default for every `#[tauri::command]`
  (`wrapper.rs:51`, `:501`). The docs say the same. Nothing about this depends on plugin routing.
  `rename_all` and `rename` are available (`wrapper.rs:79`). **conclusion** The arguments do not
  change, but every one of the 75 IPC strings does. `settings_get` becomes
  `plugin:settings|settings_get`, or `plugin:settings|get` if the function is renamed.

## 3. ACL for an inline plugin

- **source (build)** `Attributes::new().plugin(name, InlinedPlugin::new().commands(&[..]).default_permission(DefaultPermissionRule::AllowAllCommands))`
  (`tauri-build lib.rs:524`, `acl.rs:34-80`). For each command, tauri-build writes
  `allow-<cmd with _→->` and `deny-…` TOML files into **`$OUT_DIR/plugins/<name>/`**, not into the
  source tree (`acl.rs:176-190`, `tauri-utils build.rs:290-303`). With `AllowAllCommands` it also
  writes a `default.toml` holding every `allow-*` (`acl.rs:191-210`). It also reads any files
  under `permissions/<name>/**/*` (`acl.rs:231`). The schemas and the ACL manifest land in
  `gen/schemas/` (`schema.rs:28`), which is gitignored (`apps/desktop/.gitignore`).
  **conclusion** No tracked file is generated.
- **source (capability)** Every capability permission must name a known permission, and
  `<key>:default` counts as known (`acl.rs:341-396`). Anything else fails the build with
  `Permission X not found, expected one of …` (`:393`). **conclusion** `capabilities/default.json`
  needs one `"<name>:default"` per plugin.
- **source (runtime)** Commands are allowed by **exact string**, a HashMap lookup on
  `plugin:<key>|<cmd>` (`resolved.rs:198`, `authority.rs:462-472`). Wildcards are not supported.
  A **plugin** command is always ACL-checked (`webview/mod.rs:2085`: `plugin_command.is_some() || has_app_acl_manifest || !is_local`).
  If a handled command is missing from `commands(&[..])`, a release build rejects it with
  `Command plugin:<name>|<cmd> not allowed by ACL` (`:2112`). A debug build gives
  `<name>.<cmd> not allowed. Command not found` (`authority.rs:403`, `:430`).
- **observation** Nothing cross-checks `commands(&[..])` against `generate_handler!`, at build time
  or when the app starts. I looked in `acl.rs` and `handler.rs`. The list could be written by hand
  in `permissions/<name>/*.toml` instead, but that is still a list. **interpretation** The list
  can be *derived*: `commands` takes `&'static [&'static str]`, so `build.rs` could scan the
  sources for `#[tauri::command]` and leak the result. The repository already parses sources
  this way, in a test (`src/organization/command.rs:3623-3655`). Nothing in Tauri does it for
  you.
- **observation (current posture)** `build.rs:28` calls bare `tauri_build::build()`, with no
  `AppManifest` and no `permissions/` directory. `has_app_manifest` is therefore false
  (`acl.rs:417`), and app commands from the local origin are **not ACL-checked today**.
  `default.json` lists only `core:default`, `core:webview:allow-print`, `opener:default`,
  `updater:default` and `dialog:default`. **conclusion** Moving the commands into plugins is the
  first time the app's own commands pass through the ACL. The check matches strings only, but it
  is a new way for a command to be refused. Files under `permissions/<inlined-name>/` do not
  switch on an app manifest, because they are filtered out (`acl.rs:326`).

## 4. State across features

- **source** `manage` keys state by type across the whole app (`lib.rs` `Manager::manage`).
  Asking for state that was never managed fails with `state not managed for field … on command …`
  (`state.rs:64`). The docs say the same. **conclusion** A command in any plugin can take
  `State<T>` for a `T` that another plugin or the app manages. Being a plugin changes nothing
  here; only the order in which the state is managed matters (§1).
- **observation** Today `AppState` is built in the app's `.setup` under `block_on`, using
  `app_data_dir`, settings, `RemoteSync::new(..).await` and `Update::new(..).await`
  (`src/lib.rs:97-187`). Commands resolve state when they are called, so that timing still works.
  A plugin `setup` that read `AppState` would panic or miss it.

## 5. Events, deep link, single instance

- **source** The single-instance README says plugins run in the order they are added, so that
  plugin must be registered first (`README.md:60`). `deep_link()` is
  `self.state::<DeepLink<R>>()`, managed in that plugin's own `setup`
  (`deep-link lib.rs:486-487`, `:538-539`). **conclusion** A feature plugin that calls
  `app.deep_link()` inside its own `setup` must be registered after `tauri_plugin_deep_link::init()`.
- **observation** `arrive` shows and focuses `main` (`src/lib.rs:60-63`), and `main` starts with
  `"visible": false` (`tauri.conf.json:22`). Today the launch-link path (`get_current`,
  `src/lib.rs:215-219`) runs in the app's `.setup`, which comes after windows are created.
  **interpretation** If it moved into a plugin `setup`, `get_webview_window("main")` would return
  `None` (§1), and a link launch would no longer show the window. That would break requirement 19.
  A plugin's `on_event(RunEvent::Ready)` runs after windows and app setup (§1). Keeping the
  launch-link code in `lib.rs` also avoids this.
- **source** Event names only need characters from `[alnum - / : _]` (`event_name.rs:8-11`), and
  `core:default` already covers listening. `organization:link` (`src/lib.rs:42`) and
  `organization:migration` (`src/organization/command.rs:1136`) are unaffected.

## 6. Testing

- **observation** The crate does not use `tauri::test` anywhere (a grep for
  `tauri::test|mock_builder|mock_app` finds nothing). The module is only compiled with
  `feature = "test"` (`lib.rs:1129`), and `Cargo.toml` enables no tauri features.
- **source** `mock_context` embeds an **empty** `Resolved` authority (`test/mod.rs:143`), and plugin
  commands are always ACL-checked (§3). `add_capability` (default feature `dynamic-acl`,
  `lib.rs:841`) resolves against that empty ACL and `unwrap()`s (`authority.rs:174`).
  **interpretation** Calling a plugin command through `get_ipc_response` (`test/mod.rs:297`) needs
  the real context, `generate_context!()`, which carries the build's ACL. `run()` already compiles
  that under `cargo test`. The commands also have to be generic over `R: Runtime`. Today only
  `print_page` is (`print.rs:76`); `workspace_open` takes a concrete `tauri::AppHandle`
  (`organization/command.rs:1154`), and `window_*` take a concrete `tauri::Window`
  (`window.rs:12`). A plugin built as `TauriPlugin<tauri::Wry>` compiles without that change but
  cannot run on `MockRuntime`.

## 7. Gotchas

- **Command name collisions.** A `pub` or `pub(crate)` command emits `#[macro_export]` macros at
  the crate root (`wrapper.rs:163-166`, `:299-330`). Two `pub fn get` commands in different
  plugins therefore collide ("defined multiple times"; the docs say names are globally unique).
  Short IPC names need `#[tauri::command(rename = "get")]` on a function whose Rust name is
  unique across the crate.
- **Cost on the hot path.** Every invoke already runs `resolve_access` (`webview/mod.rs:2058`).
  Plugin routing adds a `strip_prefix`, a split, a linear name scan over roughly 17 plugins (9 core
  plugins, the channel plugin, 6 third-party plugins, then this app's) and a smaller `match`.
  **interpretation** That is string comparisons on a path that then runs SQL, and I did not
  measure it. `db_execute_single_sql` and `db_execute_batch_sql` are the calls it applies to
  (`client.ts:63-64`).
- **Tests that name commands.** `every_organization_command_names_its_gate` parses `lib.rs` for
  `tauri::generate_handler![` and `organization::` (`organization/command.rs:3641-3655`), so it
  breaks once `lib.rs` names no command. `roles.test.ts:21` records invoked command strings.
- **Mobile.** `mobile_entry_point` (`src/lib.rs:66`) and the Kotlin/Swift fallback
  (`webview/mod.rs` `#[cfg(mobile)]`) are not relevant on desktop.
- `removeUnusedCommands` is not set (`tauri.conf.json` `build`), so the stripping in
  `handler.rs:92-147` stays inactive.

## Command inventory (`src/lib.rs:223-299`, 75 commands)

| Module today | Count | Commands |
| --- | --- | --- |
| `window.rs` | 7 | `window_{show,hide,minimize,maximize,drag,close,restart}` |
| `database/commands.rs` | 2 | `db_execute_{single,batch}_sql` |
| `settings.rs` | 2 | `settings_{get,set}` |
| `diagnostics/command.rs` | 1 | `diagnostics_write` |
| `sync/command.rs` | 7 | `remote_sync_{state_get,rename_workspace,replicate,push}`, **`organization_consent_{begin,result,disconnect}`** |
| `organization/command.rs` | 47 | see below |
| `export.rs`, `import.rs`, `earlier.rs` | 2 each | `export_write{,_workbook}`, `import_read{,_book}`, `earlier_{find,read}` |
| `print.rs`, `update.rs`, `bootstrap.rs` | 1 each | `print_page`, `update_prepare`, `bootstrap` |

**interpretation (a candidate grouping, not a decision).** The 47 organization commands group by
sub-concept, using command names and the files under `organization/`:

- lifecycle (7): `create`, `group_inspect`, `connect_existing`, `disconnect`, `delete`,
  `account_refusal_detail`, `reconnect_authority`
- session (7): `state_get`, `sign_in`, `sign_out`, `change_password`, `session_end_elsewhere`,
  `renew_credentials`, `renew_due`
- workspace (5): `workspace_*`
- member (14): `member_{create,password_unset,assign_role,set_override,set_workspace_override,offer_ownership,withdraw_offer,rename,remove,lock_out_cost,end_sessions}`,
  `ownership_accept`, `organization_members`, `organization_member_standings`
- role (6): `organization_roles`, `role_*`
- link and join (5): `member_link_make`, `invitation_accept`, `machine_connect`,
  `organization_link_{take,read}`
- mark (3): `organization_mark_*`

These could be one plugin per sub-concept (`organization-member` and so on) or one `organization`
plugin whose single handler lists submodule paths (§1).

Commands in the wrong module:

- `organization_consent_*` lives in `sync/command.rs:290-330`. It is Turso-account consent,
  backed by `sync/turso/consent.rs`.
- `remote_sync_rename_workspace` renames a workspace.
- `workspace_*` sits in `organization/`.

Other plugins, name-legal: `window`, `database`, `settings`, `diagnostics`, `remote-sync`, a
Turso-consent plugin, `export`, `import`, `print`, `earlier`, `update`, `bootstrap`.

# Conclusion

It works, and the pieces are these:

- **The plugin.** `tauri::plugin::Builder::new("<name>")` with one `generate_handler!` and an
  optional `setup` that calls `manage`. The name must be lowercase alphanumerics and hyphens.
- **The build.** A matching `tauri_build::Attributes::new().plugin(name, InlinedPlugin::new().commands(&[..]).default_permission(AllowAllCommands))`
  in `build.rs`.
- **The capability.** One `"<name>:default"` per plugin in `capabilities/default.json`.
- **The frontend.** Every invoke string becomes `plugin:<name>|<cmd>`, with arguments unchanged.

The commands list has to be kept up to date, by hand or by a build-script scan, because a
command that is handled but not listed is refused at runtime. Plugins bring the ACL to app
commands for the first time.

Plugin `setup` runs before the app's `.setup` and before any window exists. So:

- `AppState` cannot be read there.
- The launch-link handling that shows the window must stay in the app's `.setup` or move to a
  plugin's `on_event(Ready)`.
- Single-instance and deep-link must be registered before any plugin that uses them.

Being a plugin does not change how state is shared.

# Not checked

- Nothing was built or run. The build-time and runtime error texts are read from source, not
  observed.
- Routing overhead was not measured.
- Whether a `build.rs` source scan for `commands(&[..])` is reliable enough (for example against
  `cfg`-gated commands) was not tried.
- Linux and macOS behaviour of the deep-link path under the new ordering was not checked.
- I did not look for frontend code that builds command names dynamically, beyond `tauri.ts` and
  `client.ts`.
