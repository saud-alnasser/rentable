---
status: open
blocked-by: [66, 67, 68]
---
# refactor(desktop): names and comments say what the code is

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (standards and correctness) found what the guards cannot see: the organization's gate test re-parses `generate_handler!` and lists eight files by hand where `build.rs`'s `FeaturePlugin` already derives it; `sync/tauri.ts` invokes two organization-plugin commands, a departure `contexts/desktop/feature.md` does not record; adapter headers say command names are unchanged when they changed, and a dozen comments name files this effort moved; `startup/shell-surface.ts` and `app/wall.ts` are named for what they are not; the sync standing lives in `workspace/sync-status.ts`; `LayoutFrame` and a `remoteSync` port key keep the retired vocabulary; one new comment carries an em dash; and `i18n/{en,ar}/index.ts` still hold feature strings (`common.actions.newComplex`, `newContract`, `newPayment`, the organization's refusal texts), so changing them edits a shared locale file. Each is corrected or recorded as a departure with its reason, and the four test modules that construct `upgrade::Upgrader` reach it through a test helper the upgrade module owns or are named in `rules/module-layout`'s departures.

## Acceptance Criteria

Traces requirements 8, 13, 14, 15 and 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 8, 13, 14, 15 and 18.

- [ ] One derivation of each plugin's commands; the gate test reads it (criterion 13).
- [ ] No comment or name in the diff describes a moved file or a retired name, and no source comment the effort added carries an em dash (criteria 14 and 18).
- [ ] Changing a feature's string edits only that feature's locale pieces (criterion 8).
- [ ] Every departure the review named is fixed or recorded with its reason in `rules/module-layout` or `contexts/desktop/feature.md` (criteria 15 and 18).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- the files the review named, recorded in PR #841's run log

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
