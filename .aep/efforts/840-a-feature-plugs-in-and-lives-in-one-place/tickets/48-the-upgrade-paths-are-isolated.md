---
status: resolved
blocked-by: [47]
---
# refactor(tauri): the upgrade paths for older installs are one module

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`upgrade/` holds `records.rs` (was `earlier.rs`), `format/` (was `organization/transition/`, `upgrade.rs` and format-one signing from `authority.rs`) and `shape.rs` (the old-shape machine record reads and `organization/forget.rs`'s startup check). Only `startup` and `organization/session` call it. The TypeScript side's earlier-records module moves to `workspace/` under a name that says what it reads.

## Acceptance Criteria

Traces requirements 14 and 15 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 14 and 15.

- [x] Only the one caller per path imports `upgrade`; the Rust module test holds it (criterion 15). Verified: the cycle guard's new `Callers` rule admits only `organization/session` to `upgrade`; outside `upgrade/` the only other `crate::upgrade` hits are the guard's own fixtures and a doc link; the child's scratch reference from `organization/command.rs` failed it with `forbidden organization/command.rs -> upgrade`, reverted.
- [x] The upgrade tests keep their assertions (criterion 15). Verified: the child diffed every moved upgrade test against HEAD: only imports changed, and the assertion count across the old and new files is equal; `cargo test --lib` `642 passed; 0 failed; 11 ignored`, as before.
- [x] `earlier` no longer names a module (criterion 14). Verified: `git ls-files` outside `.aep/efforts` finds no path containing `earlier`: `earlier.rs` is `upgrade/record.rs`, the TypeScript module is `workspace/app-database.ts`, and the orchestrator renamed the component and its test to `app-database-records.svelte` at integration (their baseline lines rewritten). Command names `earlier_find` and `earlier_read`, diagnostic events and stored keys keep their spelling.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0.

## Relevant areas

- `tauri/src/earlier.rs`, `organization/transition/`, `organization/upgrade.rs`, `organization/authority.rs`, `organization/forget.rs`, `sync/store.rs:868-880`
- [[rules/migrations]] (its `paths:` names `organization/transition/**`)

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
