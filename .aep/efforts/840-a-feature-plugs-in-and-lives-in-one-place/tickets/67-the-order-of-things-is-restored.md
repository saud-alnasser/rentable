---
status: resolved
---
# fix(desktop): the settings reads and the palette start where they did

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (correctness): the organization's settings reads (session, members, standings, roles, sync state) now start from each section's `load` inside the area, which mounts only once the settings query has data, so they run after it instead of beside it, and not at all when it fails; and the command palette now mounts after every host instead of between the workspace permissions and the tenant host. Both start where they did before: the reads when the settings page mounts, whatever the settings query does, and the palette at its old position in the host order. The history `concept` values are pinned by a test as the same five strings, and `machine/record.rs` prevents or documents loading the record outside `RemoteSync::new`, since `sanitize` no longer fills it.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 19.

- [x] The organization's settings reads start when the settings page mounts, before and independent of the settings query; a test holds it (criterion 19). Verified: each contributed settings section's `load` runs in `settings/component/page.svelte`'s own setup, straight after `useFetchSettings()`, not in the area; `settings/tests/page.svelte.test.ts` (loaded, pending, failed) passes, and the child ran its pending and failed cases red against the previous page.
- [x] The palette mounts between the workspace permissions and the tenant host, as before the effort; a test holds the order (criterion 19). Verified: the palette is a host (`palette/surface.ts`) listed in `app/surfaces.ts` between `workspace` and `tenant`; `shell/tests/hosts.svelte.test.ts` pins `workspace, palette, tenant, complex, unit, contract, payment, organization`, the old frame's order, and the search button opens it. The menu's open state is palette rune state, reset closed when the frame mounts (the orchestrator added the reset so an open menu does not outlive its frame, as the frame's own state did not).
- [x] A test pins the stored history `concept` values; the machine record's load outside `RemoteSync::new` is prevented or documented at the type (criterion 19). Verified: `platform/database/tests/schema.test.ts` pins the column's `enumValues` and the zod `options`, sorted, to the five stored strings; `machine/record.rs` documents at `RemoteSyncStore` that only `RemoteSync::new` loads the record, and why.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, vitest `627 passed`, build:web 0, `cargo test --lib` 649 passed, validate 0; node tests fail only the date-dependent receipt test. The area's test became the page's, its two assertions kept word for word.

## Relevant areas

- `src/lib/settings/component/{page,area}.svelte`, `src/lib/shell/component/frame.svelte`, `src/lib/palette/`, `src/lib/app/surfaces.ts`, `src/lib/platform/database/schema.ts`, `tauri/src/machine/record.rs`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
