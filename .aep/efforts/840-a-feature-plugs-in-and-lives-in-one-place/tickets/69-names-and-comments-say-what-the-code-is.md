---
status: resolved
blocked-by: [66, 67, 68]
---
# refactor(desktop): names and comments say what the code is

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (standards and correctness) found what the guards cannot see: the organization's gate test re-parses `generate_handler!` and lists eight files by hand where `build.rs`'s `FeaturePlugin` already derives it; `sync/tauri.ts` invokes two organization-plugin commands, a departure `contexts/desktop/feature.md` does not record; adapter headers say command names are unchanged when they changed, and a dozen comments name files this effort moved; `startup/shell-surface.ts` and `app/wall.ts` are named for what they are not; the sync standing lives in `workspace/sync-status.ts`; `LayoutFrame` and a `remoteSync` port key keep the retired vocabulary; one new comment carries an em dash; and `i18n/{en,ar}/index.ts` still hold feature strings (`common.actions.newComplex`, `newContract`, `newPayment`, the organization's refusal texts), so changing them edits a shared locale file. Each is corrected or recorded as a departure with its reason, and the four test modules that construct `upgrade::Upgrader` reach it through a test helper the upgrade module owns or are named in `rules/module-layout`'s departures.

## Acceptance Criteria

Traces requirements 8, 13, 14, 15 and 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 8, 13, 14, 15 and 18.

- [x] One derivation of each plugin's commands; the gate test reads it (criterion 13). Verified: the organization's gate test reads the plugin's commands from `build.rs`'s derivation (`guard::acl::plugin_in("organization")`); the hand-kept file list and the second parse are gone. The child had dropped the test's registered-versus-declared assertion; the orchestrator restored it against a walk of `src/organization/` for declared commands, and a scratch unregistered `scratch_orphan` failed it. `cargo test --lib` 649 passed.
- [x] No comment or name in the diff describes a moved file or a retired name, and no source comment the effort added carries an em dash (criteria 14 and 18). Verified: the child's script checked every backticked path in comments against the tree, and a grep for the retired names finds only dated historical notes; `startup/screen.ts` (`StartupScreen`), `sync/status.ts`, `Shell*` for `Layout*`, and startup's `sync` port key (neither stored nor on the wire) replace the old names; `app/wall.ts` is gone. The effort's staged diff adds no line with an em dash.
- [x] Changing a feature's string edits only that feature's locale pieces (criterion 8). Verified: the five create labels and the organization's shell refusals moved into their features' locale pieces; the composed `en` and `ar` are deep-equal to before, `i18n-types.ts` a pure reorder (same 8996 lines), and `composition.test.ts` passes.
- [x] Every departure the review named is fixed or recorded with its reason in `rules/module-layout` or `contexts/desktop/feature.md` (criteria 15 and 18). Verified: `sync/tauri.ts` calling the organization plugin, the test modules building `upgrade::Upgrader`, and the refusal-field map (now contributed by each feature and composed in `app/refusal.ts`) are recorded in `rules/module-layout` and `contexts/desktop/feature.md`; `rules/api-layer` states the core-plugin-name ban; `validate.mjs` passes.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo test --lib` 649 passed with no warning, check 0, eslint 0, prettier 0, vitest `627 passed`, build:web 0, the layer, naming and governance tests `pass 14 / fail 0`, validate 0; node tests fail only the date-dependent receipt test. Test changes: startup tests use the `sync` key and `startupScreen`, two form tests gained a `bindRefusalFields` setup line.

## Relevant areas

- the files the review named, recorded in PR #841's run log

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
