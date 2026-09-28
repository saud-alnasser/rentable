---
status: open
blocked-by: [56]
---
# refactor(tauri): lib.rs composes plugins and nothing else

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`upgrade` becomes a plugin; `state.rs` and `AppState` go, each plugin managing its own state; `lib.rs` holds the plugins in order, one line each, with the ordering documented beside it. The Rust module baseline is empty.

## Acceptance Criteria

Traces requirements 5 and 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5 and 9.

- [ ] `lib.rs` has no `generate_handler!` and no command path; `state.rs` is gone (criterion 9).
- [ ] The Rust module test's baseline is empty (criterion 5).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/lib.rs`, `tauri/src/state.rs`, `tauri/src/upgrade/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
