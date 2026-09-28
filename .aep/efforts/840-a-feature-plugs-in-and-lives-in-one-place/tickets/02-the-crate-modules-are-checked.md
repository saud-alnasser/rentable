---
status: open
blocked-by: [60]
---
# test(tauri): the crate's modules are checked for cycles against a baseline

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

A Rust test reads `tauri/src/`, builds the graph of top-level modules from `use crate::` and inline `crate::x::` paths (tests excluded), and fails on a cycle or a forbidden edge not in a checked-in baseline, and on a baseline line that no longer occurs. The forbidden edges named now: `sync` to `organization`, `organization` to `sync` internals; anything to `upgrade` but its callers is added once `upgrade` exists.

## Acceptance Criteria

Traces requirements 5, 11 and 15 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 5, 11 and 15.

- [ ] The test passes on this commit with today's four cycles in the baseline (criterion 5).
- [ ] A scratch edit adding a new cycle fails it (criteria 5 and 11).

## Relevant areas

- `tauri/src/organization/command.rs` `every_organization_command_names_its_gate` (the text-parse pattern)

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
