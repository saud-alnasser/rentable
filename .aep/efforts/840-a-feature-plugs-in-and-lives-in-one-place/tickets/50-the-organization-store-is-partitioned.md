---
status: resolved
blocked-by: [49]
---
# refactor(tauri): the organization store is partitioned by sub-concept

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`OrganizationStore` stays one type; its 92 methods and 21 tables move into one file per sub-concept under `organization/store/` (an `impl OrganizationStore` block each), with sealing and format policy apart from the repository methods.

## Acceptance Criteria

Traces requirements 10 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 10 and 17.

- [x] `store/` has one file per sub-concept; none passes 1,000 production lines (criteria 10 and 17). Verified: `organization/store/` holds `mod.rs` plus one file per sub-concept (member, role, invitation, workspace, ownership, session, setup, authority, mark, lease) and `signature.rs` (sealing) and `format.rs` (format policy), each an `impl OrganizationStore` block. Production lines counted up to each file's `#[cfg(test)]` line: the largest are `workspace.rs` 641, `format.rs` 616, `mod.rs` 551. The child compared every non-comment line: SQL literals match one for one.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `642 passed; 0 failed; 11 ignored`, clippy at its seven pre-existing warnings, `pnpm test` 0, validate 0; tests stay in `mod.rs` with assertions unchanged (one skip path names `store/`).

## Relevant areas

- `tauri/src/organization/store.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The public methods keep their names and signatures in this ticket.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
