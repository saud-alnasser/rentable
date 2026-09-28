---
status: open
blocked-by: [49]
---
# refactor(tauri): the organization store is partitioned by sub-concept

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`OrganizationStore` stays one type; its 92 methods and 21 tables move into one file per sub-concept under `organization/store/` (an `impl OrganizationStore` block each), with sealing and format policy apart from the repository methods.

## Acceptance Criteria

Traces requirements 10 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 10 and 17.

- [ ] `store/` has one file per sub-concept; none passes 1,000 production lines (criteria 10 and 17).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/organization/store.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The public methods keep their names and signatures in this ticket.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
