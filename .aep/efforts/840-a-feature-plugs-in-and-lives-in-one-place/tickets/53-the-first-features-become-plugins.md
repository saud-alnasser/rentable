---
status: open
blocked-by: [52, 24]
---
# refactor(tauri): the plugin machinery lands with diagnostics, window and settings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each of `diagnostics`, `window`, `settings` becomes an inline plugin with its own `plugin.rs` (plan, *Tauri IPC*); `build.rs` derives each plugin's command list from its `generate_handler!` and registers it as an `InlinedPlugin` with `AllowAllCommands`; `capabilities/default.json` gains `"<plugin>:default"`; their TypeScript adapters invoke `plugin:<name>|<command>`.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [ ] A Rust test asserts each derived list equals its handler (criterion 9).
- [ ] `diagnostics` registers first; state shared across plugins is managed before them (criterion 9).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/lib.rs`, `tauri/build.rs`, `tauri/capabilities/default.json`, the three modules and their TypeScript adapters

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Evidence: [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/research/how-a-tauri-feature-becomes-a-plugin]].
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
