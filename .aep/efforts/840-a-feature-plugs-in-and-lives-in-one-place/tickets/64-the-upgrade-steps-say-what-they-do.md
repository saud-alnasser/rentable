---
status: resolved
---
# refactor(tauri): the upgrade steps are named for what they do

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Converge round one: requirement 14 names `transition/two.rs` and `transition/three.rs` among the names that say nothing, and they are still `upgrade/format/two/` and `upgrade/format/three.rs`. Each is renamed for the change it makes to the stored format, with its tests, fixtures and every reference (Rust, TypeScript comments, rules and contexts) following; the format numbers themselves, which are stored, keep their values.

## Acceptance Criteria

Traces requirement 14 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 14.

- [x] No module under `upgrade/` is named by a number; each name says the change it makes (criterion 14). Verified: `find tauri/src/upgrade -type f` lists `format/{chain/, overriding.rs, runner/, signature.rs, test/}` and `upgrade/{mod,plugin,record,shape}.rs`; no module is named by a number (`two/` became `chain/`, which re-signs every row from the chain's root; `three.rs` became `overriding.rs`, which adds the workspace override table; `override` is reserved in Rust).
- [x] The upgrade tests pass with their assertions unchanged, and no stored format number or spelling changes (criteria 15 and 19). Verified: `cargo test --lib` `648 passed; 0 failed; 11 ignored`, the upgrade tests among them with assertions unchanged; `plan.rs` renamed with 0 lines changed; `from: 1/2`, the transition names, `FORMAT_VERSION` and the step order are untouched.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, the Rust tests above with no warning (the orchestrator dropped an unused test import ticket 63 left in `role/permission.rs`), check 0, eslint 0, vitest 0, validate 0; node tests fail only the date-dependent receipt test.

## Relevant areas

- `tauri/src/upgrade/format/`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
