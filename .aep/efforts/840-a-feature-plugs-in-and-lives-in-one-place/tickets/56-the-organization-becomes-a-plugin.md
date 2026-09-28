---
status: open
blocked-by: [55]
---
# refactor(tauri): the organization becomes a plugin

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization` becomes one plugin whose handler lists its sub-concepts' commands; Rust names follow `<sub-concept>_<act>` and IPC names drop the plugin prefix (plan, *Tauri IPC*); the link arrival moves from `lib.rs`'s `arrive` to the plugin's `on_event(Ready)` or stays in the app `.setup`, never a plugin `setup`. `every_organization_command_names_its_gate` reads the plugin's handler, and `roles.test.ts` records the new strings.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [ ] `organization` is a plugin; `lib.rs` names none of its commands (criterion 9).
- [ ] A link launch while closed still shows the window: a test where one can reach it, and the human check at the close.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/organization/`, `tauri/src/lib.rs` `arrive`, `src/lib/organization/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
