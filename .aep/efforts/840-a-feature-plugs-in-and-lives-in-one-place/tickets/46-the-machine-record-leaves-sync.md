---
status: resolved
blocked-by: [45]
---
# refactor(tauri): the machine record leaves sync, and the cycle breaks

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`sync/store.rs`'s `RemoteSyncStore` becomes the `machine/` module; `sync/command.rs`'s calls into `organization` move to `organization` (`remote_sync_rename_workspace` and the `organization_consent_*` commands go to where their subject is). `sync` is the workspace replica and its credential only.

## Acceptance Criteria

Traces requirements 5 and 11 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5 and 11.

- [x] `sync` imports nothing from `organization` and `organization` nothing from `sync` internals; the Rust baseline loses the cycle (criteria 5 and 11). Verified: `grep -rn crate::organization src/sync` prints nothing; `grep -rn crate::sync:: src/organization` finds only `crate::sync::test::` in test code. `cycle.baseline.txt` loses `cycle bootstrap -> sync`, `organization -> sync`, `state -> sync`, `sync -> database`, `sync -> organization`, `sync -> settings`, `sync -> state` and `forbidden sync -> organization`, and gains nothing; `sync` has left the tangle. The record is `machine/record.rs`, reading the database path through a `machine::DatabasePath` port.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `637 passed; 0 failed; 11 ignored`, clippy at its seven pre-existing warnings, check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0. Test changes: five moved commands added to the organization command-gate table, and the two consent mutations joined `COMMAND_OF` in `router.test.ts`; same checks.

## Relevant areas

- `tauri/src/sync/store.rs`, `sync/command.rs`, `state.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The machine record's file format and serde names do not change (spec, *Constraints*).
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
