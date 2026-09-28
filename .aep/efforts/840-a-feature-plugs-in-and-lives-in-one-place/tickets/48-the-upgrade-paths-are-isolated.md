---
status: open
blocked-by: [47]
---
# refactor(tauri): the upgrade paths for older installs are one module

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`upgrade/` holds `records.rs` (was `earlier.rs`), `format/` (was `organization/transition/`, `upgrade.rs` and format-one signing from `authority.rs`) and `shape.rs` (the old-shape machine record reads and `organization/forget.rs`'s startup check). Only `startup` and `organization/session` call it. The TypeScript side's earlier-records module moves to `workspace/` under a name that says what it reads.

## Acceptance Criteria

Traces requirements 14 and 15 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 14 and 15.

- [ ] Only the one caller per path imports `upgrade`; the Rust module test holds it (criterion 15).
- [ ] The upgrade tests keep their assertions (criterion 15).
- [ ] `earlier` no longer names a module (criterion 14).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/earlier.rs`, `organization/transition/`, `organization/upgrade.rs`, `organization/authority.rs`, `organization/forget.rs`, `sync/store.rs:868-880`
- [[rules/migrations]] (its `paths:` names `organization/transition/**`)

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
