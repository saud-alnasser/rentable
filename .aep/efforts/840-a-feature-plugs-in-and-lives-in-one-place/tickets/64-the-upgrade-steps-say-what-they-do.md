---
status: open
---
# refactor(tauri): the upgrade steps are named for what they do

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Converge round one: requirement 14 names `transition/two.rs` and `transition/three.rs` among the names that say nothing, and they are still `upgrade/format/two/` and `upgrade/format/three.rs`. Each is renamed for the change it makes to the stored format, with its tests, fixtures and every reference (Rust, TypeScript comments, rules and contexts) following; the format numbers themselves, which are stored, keep their values.

## Acceptance Criteria

Traces requirement 14 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 14.

- [ ] No module under `upgrade/` is named by a number; each name says the change it makes (criterion 14).
- [ ] The upgrade tests pass with their assertions unchanged, and no stored format number or spelling changes (criteria 15 and 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/upgrade/format/`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
