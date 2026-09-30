---
status: resolved
blocked-by: [60]
---
# test(tauri): the crate's modules are checked for cycles against a baseline

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

A Rust test reads `tauri/src/`, builds the graph of top-level modules from `use crate::` and inline `crate::x::` paths (tests excluded), and fails on a cycle or a forbidden edge not in a checked-in baseline, and on a baseline line that no longer occurs. The forbidden edges named now: `sync` to `organization`, `organization` to `sync` internals; anything to `upgrade` but its callers is added once `upgrade` exists.

## Acceptance Criteria

Traces requirements 5, 11 and 15 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5, 11 and 15.

- [x] The test passes on this commit with today's four cycles in the baseline (criterion 5). Verified: `cargo test --lib guard` printed `test guard::cycle::tests::the_crate_modules_form_no_new_cycle_and_break_no_rule ... ok` and `7 passed; 0 failed`; full `cargo test --lib` printed `636 passed; 0 failed; 11 ignored`. The survey's four cycles are one tangle of nine modules (backup, bootstrap, database, organization, schema, settings, state, sync, update), recorded as its 27 cycle edges, plus the forbidden `sync -> organization` and `organization -> sync::turso` edges.
- [x] A scratch edit adding a new cycle fails it (criteria 5 and 11). Verified: a scratch `fn scratch() { crate::http::install_crypto_provider(); }` in `error.rs` printed `cycle error -> http` / `closes error -> http -> error`, `cycle http -> error`, and `test result: FAILED. 1 passed; 1 failed`; reverted.

## Relevant areas

- `tauri/src/organization/command.rs` `every_organization_command_names_its_gate` (the text-parse pattern)

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
