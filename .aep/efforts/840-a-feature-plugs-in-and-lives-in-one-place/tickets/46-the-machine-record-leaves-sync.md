---
status: open
blocked-by: [45]
---
# refactor(tauri): the machine record leaves sync, and the cycle breaks

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`sync/store.rs`'s `RemoteSyncStore` becomes the `machine/` module; `sync/command.rs`'s calls into `organization` move to `organization` (`remote_sync_rename_workspace` and the `organization_consent_*` commands go to where their subject is). `sync` is the workspace replica and its credential only.

## Acceptance Criteria

Traces requirements 5 and 11 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5 and 11.

- [ ] `sync` imports nothing from `organization` and `organization` nothing from `sync` internals; the Rust baseline loses the cycle (criteria 5 and 11).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/sync/store.rs`, `sync/command.rs`, `state.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The machine record's file format and serde names do not change (spec, *Constraints*).
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
