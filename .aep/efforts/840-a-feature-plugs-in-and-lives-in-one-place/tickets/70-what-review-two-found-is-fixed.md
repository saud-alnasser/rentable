---
status: resolved
---
# fix(desktop): what review round two found is fixed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round two found no defect in behaviour and nine smaller ones, all closed here since there is no third round. Correctness: the organization gate test's source walk counts only `#[tauri::command(rename = ..)]`, so a bare `#[tauri::command]` declared and left out of the handler passes; and `guard/acl.rs` refuses Tauri's core plugin names but not the third-party plugins registered after the feature plugins (deep-link, opener, dialog, fs, updater, single-instance), any of which would replace a feature plugin of the same name. Standards: `contexts/desktop/feature.md` calls `sync/tauri.ts` the one port reaching another plugin while `workspace/tauri.ts` invokes `plugin:upgrade|earlier_*` and `platform/tauri.ts` invokes `plugin:settings|get`, neither recorded; `i18n/{en,ar}/index.ts` still hold single-concept strings under `common.actions` and `common.labels` (update, startup, contract, settings), and the unit's refusal sentences sit in the complex's locale piece; `palette/menu.svelte.ts` holds host state under a name the canonical shape reserves elsewhere (`host.svelte.ts`); a doc line in `organization/mod.rs` sits above the wrong function; the layer test exempts route type imports without the rule saying so; and the feature context writes `"<feature>:default"` where the capability grants `"<plugin>:default"` (the window module's plugin is `frame`).

## Acceptance Criteria

Traces requirements 8, 9, 13, 14 and 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 8, 9, 13, 14 and 18.

- [x] The gate test counts every `#[tauri::command]` in `organization/`, renamed or bare; a scratch bare command left out of the handler fails it (criterion 13). Verified: `declared_in_source` in `organization/mod.rs` reads both `#[tauri::command(rename = ..)]` and bare `#[tauri::command]` by the next `fn` name; the child's scratch bare `organization_member_scratch` failed the gate test; the misplaced doc line is back above `ungated`.
- [x] No feature plugin takes the name of a core plugin or of any plugin `lib.rs` registers; a scratch name `dialog` fails the guard (criterion 9). Verified: `guard::acl::tests::no_plugin_takes_the_name_of_a_registered_plugin` holds every feature plugin clear of the plugins `lib.rs` registers from crates (deep-link, dialog, fs, opener, single-instance, updater); a scratch `Builder::new("dialog")` failed it.
- [x] Every port that invokes another plugin's command is recorded, with its reason, in `rules/module-layout` and `contexts/desktop/feature.md`, or no longer does (criterion 18). Verified: `rules/module-layout` departures and `contexts/desktop/feature.md` record the three ports reaching another plugin (`sync/tauri.ts` to organization, `workspace/tauri.ts` to upgrade, `platform/tauri.ts` to settings) with their reasons.
- [x] Changing a feature's or a sub-concept's string edits only its own locale piece; the shared index holds only vocabulary more than one concept speaks, the composed `en` and `ar` stay deep-equal and `i18n-types.ts` a pure reorder (criterion 8). Verified: 53 single-concept keys moved from `common.actions` and `common.labels` into their concepts' pieces, and the unit's refusals into `complex/unit/i18n`; the keys read by nothing stay, named beside `SHARED`. The orchestrator loaded the base's (`1aa8d6a5`) and HEAD's composed locales: `en true ar true` (`isDeepStrictEqual`); `i18n-types.ts` is a pure reorder.
- [x] The palette's host state follows the canonical shape, the misplaced doc line is corrected, the route type-import rule and the guard agree, and the context names `"<plugin>:default"` (criteria 14 and 18). Verified: `palette/menu.svelte.ts` is `palette/host.svelte.ts`; the layer test counts route type imports (a scratch route type import of `$lib/tenant` failed it) and the rule says so; the context names `"<plugin>:default"` and the name ban.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `650 passed` with no warning, check 0, eslint 0, prettier 0, vitest `627 passed`, build:web 0, validate 0; node tests fail only the date-dependent receipt test. No assertion changed; every guard baseline is empty.

## Relevant areas

- `tauri/src/organization/mod.rs`, `tauri/src/guard/acl.rs`, `src/lib/i18n/`, `src/lib/complex/unit/i18n/`, `src/lib/palette/`, `src/lib/tests/layers.test.ts`, `.aep/rules/module-layout.md`, `.aep/contexts/desktop/feature.md`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
