---
use-when: "judging where the desktop codebase costs a change, or checking a claim effort 840 makes about the tree as it stood at 1aa8d6a5"
---

# Survey — where the architecture costs, 2026-09-28

Four read-only surveys run at `/specify`, against `main` at `1aa8d6a5`, by sub-agents with one
bound each: the Rust crate, the frontend concept modules, the touch points of one feature end to
end, and the component layer with the packages. What follows is what they established, with the
paths a reader can check. Counts are as of that commit. Paths are relative to `apps/desktop/`
unless written from the root.

Not surveyed: CI workflows beyond what the integration gate runs, `scripts/`, the generated
`i18n-types.ts`, migration SQL, and performance.

## 1. A record kind has no single declaration

Adding a record kind like `tenant` edits about 34 files outside `src/lib/tenant/`, 25 of them by
hand, in TypeScript and Rust. The hand-kept lists:

| Where | What is listed |
| --- | --- |
| `src/lib/api/router.ts:4,18` | the root router, by hand; `payment` and `dashboard` mount under `contract/router.ts:47,50`, `settings`, `remoteSync` and `organization` under `api/app.ts:4-15` |
| `src/lib/api/refusal.ts:6,34`, `error/refusal.ts:186-213`, `error/tauri.ts:87` | refusal codes, their form fields, the host refusal list |
| `packages/workspace-permission/index.ts:58-61,106,150,363` | flag bits, families, write flags, the built-in member role |
| `src/lib/workspace/permission.ts:30-63` | `RecordKind`, `VIEW_FLAG`, `EXPORT_FLAGS`, `IMPORT_FLAGS`, restated although the package exports `RECORD_KINDS` |
| `organization/role.ts:52`, `organization/glyph.ts:37` | editable families, the kind's glyph |
| `history/history.ts:16,47`, `platform/database/schema.ts:226,238` | `HistoryConcept` and the stored `concept` enum, twice |
| `design/query.ts:26`, `workspace/query.ts:39` | cache prefixes |
| `layout/navigation.ts:13,38,96`, `layout/destination.ts:49`, `layout/component/breadcrumb.svelte:21` | routes, trail places, sidebar, breadcrumb labels |
| `layout/create.ts:31,66`, `layout/palette.ts:27`, `layout/component/palette.svelte:66`, `layout/record-search.ts:15-91` | create, palette subjects, palette addresses, search |
| `layout/component/frame.svelte:7,210` | each concept's host mounted by hand |
| `workspace/workspace.ts` (10 sites), `workspace/router.ts` (8 sites) | the transfer shape, importer, exporter, ordering — the largest single edit |
| `i18n/en/index.ts`, `i18n/ar/index.ts` | about 48 keys across `common.*` and the kind's namespace |
| `tauri/src/organization/permission.rs:71-384`, `tauri/src/error.rs:191` | the Rust mirror of the flag table, the host refusal reason |
| `api/tests/flags.test.ts:51-108`, `packages/workspace-permission/tests/permission.test.ts:94-126` | tests with closed lists |

`RecordKind` is declared about five times independently. What already works as an adapter, where
a feature opts in by declaring something: record acts (`<concept>/acts.ts`, projected by
`design/acts.ts`), undo (`inverse` on the mutation declaration, `design/mutation.ts:119`), history
writes (`history` on the same declaration), print, the shortcut registry, and the database
transport factory `createDatabase(single, batch)`.

## 2. Concepts import each other both ways, and have no public surface

- **TypeScript cycles**: contract ↔ payment, contract ↔ tenant, contract ↔ complex, contract ↔
  dashboard, organization ↔ settings, organization ↔ layout, organization ↔ workspace, platform ↔
  tenant (`platform/database/schema.ts:1` imports `$lib/tenant/tenant`).
- **Homes that own no concept import concepts**: `design/acts.ts:7` and `design/inverse.ts:3`
  import `workspace/permission`; `design/inverse.ts:1` and `design/mutation.ts:3` import
  `history/history`; `api/trpc.ts:1` imports `sync/event`.
- **Seven files import another concept's `component/*.svelte`**, e.g.
  `tenant/component/contracts.svelte:5-6`, `contract/component/details.svelte:15`,
  `organization/component/workspaces.svelte:21-22`. The only `index.ts` in `src/lib` is
  `design/cell/index.ts`.
- **`workspace/permission.ts` has 28 importers** including `design` and `layout`, so it is
  cross-cutting while living in a concept.
- **Rust cycles**: organization ↔ sync (`sync/store.rs:15`, `sync/command.rs:31,100,158`,
  `sync/turso/consent.rs:1365` one way; `organization/authority.rs:114`, `setup.rs:1223,1334`,
  `command.rs:2232`, `forget.rs:70` the other); `state.rs` ↔ every feature; database ↔ sync
  (`database/mod.rs:23`); organization → bootstrap → sync → organization. `sync/` is three
  concepts: the machine record (`RemoteSyncStore`, which holds `HeldOrganization`), the Turso
  adapter (`sync/turso/*`), and OAuth (`sync/oauth/*`).

## 3. Grab-bags and oversized modules

- **Rust `organization/`** is 61,058 of the crate's 82,270 lines. `store.rs` (3,985 production
  lines) is one `OrganizationStore` with 92 async methods and 21 `CREATE TABLE`s, mixing schema,
  repository, signing and format policy. `command.rs` (2,302) holds 49 commands and repeats
  `signed_in(...)` 35 times, `store.pull()` 25 times, `remote_sync` locking 39 times. `role.rs`
  2,533, `authority.rs` 1,773, `invite.rs` 1,670, `session.rs` 1,406, `setup.rs` 1,344.
- **Rust registration**: `lib.rs` (the most-changed file in the crate, 20 commits) holds six
  plugins, one setup closure that builds every state object and organization's deep-link
  `arrive()`, and one `generate_handler!` listing 80 commands. Adding a feature with commands and
  state takes six to eight touch points plus one line per command.
- **`layout/`** (36 files, 5,029 lines) is four things: the startup lifecycle (`startup.ts` 1,027
  lines, five `startup-*` modules, seven `startup-*.svelte`), organization and workspace menus,
  hard-coded concept registries, and the shell.
- **`platform/host.ts`** (1,019 lines) is one interface for every host capability; about 640 of
  its lines are organization's types and methods.
- **`organization/`** (47 source files, 11.5k lines) holds a workspace sub-domain beside the
  `workspace/` concept, and unnamed member, role and access groups flattened into 34 components.
- **`settings/query.ts`** mixes remote sync state, workspace rename, earlier records, updates and
  restart; `layout/component/sidebar.svelte:15` reads sync state from it.
- **i18n** is one file per locale (`en` 1,609 lines, `ar` 1,444, generated types 8,995), and the
  three are the most-changed files in the repository since July (49 commits each).
- **Oversized TypeScript and Svelte**: `contract/router.ts` 1,637, `design/block/list.svelte`
  1,293, `organization/query.ts` 1,142, `contract/component/form.svelte` 1,087, `layout/startup.ts`
  1,027, `complex/router.ts` 877, `workspace/workspace.ts` 807, `organization/component/host.svelte`
  769.
- **Fat routes**: `routes/+layout.svelte` 495 lines, `routes/organization/new/+page.svelte` 312,
  `routes/settings/+page.svelte` 223, `routes/organization/join/+page.svelte` 207; every entity
  route is 8 to 13 lines.

## 4. One thing done several ways

- Only tenant, complex, contract and payment share a shape (`router`, `<concept>.ts`, `query`,
  `acts`, `host.svelte.ts`, `component/`, `tests/`). Seven concepts each differ. `complex/unit/` is
  the one nested sub-concept; contract keeps eleven helper modules flat.
- Mutations: `declareMutation` in the record concepts; raw `createMutation` 34 times in
  `organization/query.ts` and 9 in `settings/query.ts`. Queries outside `query.ts` in
  `workspace/earlier.ts`.
- Routers: `export default` in most, `export const` in `organization/router.ts:116` and
  `sync/router.ts:21`.
- Near-duplicates: dates in `api/date.ts` and `design/date.ts`; refusals in `api/refusal.ts`,
  `error/refusal.ts`, `sync/refusal.ts`; periods in `api/period.ts` and `payment/period.ts`; search
  in `api/search.ts`, `platform/database/search.ts`, `layout/record-search.ts`; test harnesses
  `tests/testing.ts` in four directories.
- Rust: `database/commands.rs` against `command.rs` elsewhere; `organization/migrate.rs` beside
  `organization/migration.rs`; `earlier.rs`, `mark.rs`, `two.rs`, `three.rs` do not say what they
  are; `organization_consent_*` commands defined in `sync/command.rs:290-330`; side error enums
  `PlatformError`, `SyncRefusal`, `ReplicationRefusal`; `Result<_, String>` in
  `transition/two.rs`, `print.rs`, `authority.rs`; 56 hand-written `map_err` sites; the test
  scratch-directory helper copied 28 times; the keyring swapped for a fake by `cfg(test)` in 18
  blocks, so tests serialise on one credential store.

## 5. Dead and legacy

- **23 shadcn primitive families nothing imports** in `packages/design/src/lib/primitive/`, 169
  files: accordion, alert-dialog, aspect-ratio, button-group, card, carousel, chart, data-table,
  drawer, hover-card, input-otp, item, menubar, native-select, navigation-menu, pagination,
  radio-group, range-calendar, resizable, scroll-area, slider, table, tabs. Four carry tests, two
  harnesses serve them, and five dependencies serve only them (`embla-carousel-svelte`,
  `layerchart`, `paneforge`, `vaul-svelte`, `@tanstack/table-core`).
- **`packages/turso-platform`**: 1,172 lines imported by nothing, still run by `turbo run test`.
- **`src/lib/platform/database/hosted.ts`**: 238 lines, imported only by its own test.
- **Dead exports**: `complex/query.ts:216` `useFetchComplexes`, `api/date.ts:22`
  `isWithinUtcRange`, `sync/event.ts:101` `listenForWorkspaceSyncResults`, `sync/workspace.ts:83`
  `getWorkspaceFromSyncState`.
- **Rust**: `#[allow(dead_code)]` on `database/proxy.rs:316` and on the OAuth refresh fields in
  `sync/oauth/token.rs:22,24,92`; `error.rs:312` `with_context` called only by a test; Google and
  control-plane vocabulary left in `diagnostics/record.rs:27`, `database/version.rs:7,36`,
  `sync/oauth/*`, `sync/test/server.rs:7-10`.
- **Config**: `.gitignore` entries for `src/tests/run.ts` and `src/tests/exit-reason.ts`, which no
  longer exist; control-plane history in `turbo.json`; "local or hosted" in
  `packages/workspace-migrations`.

**Live, not legacy**: `tauri/src/earlier.rs` (reads 0.12 and 0.13's `app.db`) and
`organization/transition/{two,three}.rs` with `upgrade.rs` and the format-one signing in
`authority.rs` were written by effort 838 so installs on 0.12 to 0.15 can update, about 8.7k lines.
So are the old-shape reads in `sync/store.rs:868-880` and `organization/forget.rs`. The human chose
to keep them and isolate them.
