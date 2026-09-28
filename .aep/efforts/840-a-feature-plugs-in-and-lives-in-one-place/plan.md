---
use-when: "building a ticket in effort 840, or judging where a file belongs in the tree this effort produces"
---

# Architecture

**A feature is a directory that exports a declaration, and one composition root lists the
declarations.** On the TypeScript side the declaration is two values, `feature` (what loads under
Node: router, record kind, cache prefix, history concept, transfer) and `surface` (what the shell
draws: navigation, create, search, acts, host, sections). `src/lib/app/` holds the two lists and
builds everything the shell iterates from them, including the root router, whose type is inferred
from the list. On the Rust side the declaration is an app-defined inline Tauri plugin, and
`lib.rs` registers one per feature.

The human chose both seams on 2026-09-28, after two research files:
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/research/how-features-plug-into-a-shell]]
and
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/research/how-a-tauri-feature-becomes-a-plugin]].
It is the shape Now in Android, SwiftUI's `App`, The Composable Architecture and Backstage's
`createApp({ features })` use for features compiled into the application: one literal list, types
derived from it, and a lint or build check (not the registration pattern) keeping features out of
each other's internals.

**Mechanisms are modules of their own, called capabilities, and they sit one layer below the
features.** Undo and redo, mutation and the query cache, history, shortcuts, notifications, the
command menu, create, record acts, lists, forms, transfer, print and permission are each one
directory with an `index.ts` API (the human's direction, 2026-09-28: "mechanical things are
encapsulated into a single feature module then registered and used by the UI, so a single place is
changed"). A feature uses a capability through its API and registers with it through its own
declaration; **a capability never imports a feature.** Where a capability needs what features
declare (the command menu needs every feature's search, transfer needs every feature's sheet), the
composition root hands it the list: dependency injection from the one place that already names
everything, never an import upwards.

**Four layers, and imports point down or sideways through an entry, never up and never in a
cycle:**

| Layer | Holds | May import |
| --- | --- | --- |
| 4 composition | `app/`, `shell/`, `src/routes/` | everything below |
| 3 features | tenant, complex, contract, payment, dashboard, workspace, organization, settings, sync, update, startup | capabilities and foundation; another feature only through its `index.ts` |
| 2 capabilities | permission, mutation, undo, history, shortcut, notification, palette, create, act, list, form, transfer, print, date | foundation; another capability only through its `index.ts` |
| 1 foundation | `feature/` (the declaration contract), `design/` (presentation only), `platform/`, `api/` (tRPC wiring), `i18n/` runtime, `error/` (decoding) | the design package and third-party code only |

**Features never import each other's user interface.** Where one feature shows something on
another's page (a tenant's contracts, a contract's payments, the organization's settings panels)
it contributes a **section** from its own `surface`, and the page renders the sections that target
it. This is what breaks the contract ↔ tenant, complex, payment and dashboard cycles and the
organization ↔ settings, layout and workspace cycles without moving any behaviour.

## Alternatives that lost

| | Why it lost |
| --- | --- |
| **TS: self-registering extension points** (`register…()` called from side-effect imports) | A router pushed into a registry at import time is invisible to `typeof appRouter`, so the typed client is lost or restored by module augmentation that claims a feature exists when its import is missing. Registration order becomes import order, and `design/acts.ts` already rejects a runtime registry for the reason that a surface should not depend on what was registered when it drew. The human leaned this way and chose the list once the research showed even VS Code, the best-known self-registering shell, imports every feature from one hand-kept file |
| **TS: VS Code style** (contribution files register into typed registries; one main file imports each) | Offered as the hybrid. Keeps the router in a list anyway, so it is two mechanisms where one does; the registries are typed by cast in VS Code itself |
| **TS: discovery by `import.meta.glob`** | Fails under `node --test` (`define_import_meta_default.glob is not a function`, run by the researcher); every match has one type, so router types are lost; order needs a field. The platforms use discovery only for separately installed code |
| **Rust: dispatch table by command prefix** | Recommended at first: no ACL change, no IPC rename. The human chose plugins, which are Tauri's own unit of a feature (setup, state, events, commands in one value) |
| **Rust: `macro_rules!` composition of command lists** | Keeps command names, but the macro is clever and opaque, and state and setup would still need a second seam |
| **Rust: one store type per organization sub-concept** | Cross-sub-concept writes (re-signing every row after a standing changes) run in one transaction over one connection; separate stores make that awkward and add risk to a change that must preserve behaviour. The store stays one type; its implementation is partitioned (below) |
| **Schema split per concept** | Drizzle-kit reads one file today and the tables are one database. Splitting it buys little locality (a new kind still needs its table and a migration) against a real risk of a spurious migration. The tables stay in `platform/database/schema.ts`; what is concept-specific about them (the zod input schemas that use a concept's validators) moves to the concept, which is what removes `platform → tenant` |

# Components

## TypeScript, `apps/desktop/src/lib/`

```
app/                 the composition root. The one place that names every feature.
  features.ts        `export const features = [tenant, complex, unit, contract, payment, dashboard,
                     history, workspace, organization, settings, sync, update, print, startup] as const`
  surfaces.ts        the same list of `surface` values, in presentation order
  router.ts          appRouter = router(routersOf(features)); AppRouter
  host.ts            the composed Host: each crossing concept's port, bound to its Tauri adapter
  caller.ts          moved from api/
  tests/             the composed fake host and caller every router test uses
feature/             the contract a feature declares against (no concept imports)
  feature.ts         Feature, RecordFeature, defineFeature, routersOf, RoutersOf
  surface.ts         Surface, Section, SettingsSection, NavigationPlace, CreateEntry, SearchEntry
shell/               was layout/: frame, sidebar, breadcrumb, navigation, palette, window controls.
                     Iterates app/surfaces; names no feature
startup/             was layout/startup*: the startup lifecycle and its seven screens
capabilities (layer 2), each one directory with index.ts:
  permission/        was workspace/permission.ts: RecordKind, flags, memberPermissions. Derives
                     from @rentable/workspace-permission's RECORD_KINDS
  mutation/          was design/mutation.ts + design/query.ts: declareMutation, the workspace
                     query-cache policy. Records undo and history through their APIs; cache
                     prefixes come from features' declarations, handed over by app/
  undo/              was design/inverse.ts, inverse.svelte.ts, undo-shortcut.ts: the undo and redo
                     stacks, issuing an inverse, and its own shortcut registered through shortcut/
  history/           the record history: router, the entry type and keys (was split across
                     history/history.ts and design), and the section it contributes to record pages
  shortcut/          was design/shortcut-registry.ts, .svelte.ts: the registry and the one listener
  notification/      was error/toast.ts + design/provider/sonner.svelte: notify, and the provider
  palette/           was layout/palette*, record-search.ts: the command menu, its search and create
                     groups, built from what surfaces declare
  create/            was design/create-intent, create-key, create-target, landing, and
                     design/block/create-control.svelte: the create intent and where a record lands
  act/               was design/acts.ts: the record act shape and its projections
  list/              was design/block/list.svelte, list-toolbar, search-field, list-keyboard,
                     list-motion, filter: the list and what it offers
  form/              was design/form.ts
  transfer/          was design/import.ts + workspace/workspace.ts's transfer + the per-kind lists in
                     workspace/router.ts: directory import and the whole-workspace workbook, built
                     from each feature's `transfer` declaration
  print/             unchanged in role; a capability now
  date/              was api/date.ts, design/date.ts, api/period.ts, payment/period.ts
design/              presentation only: the cells and language-choice; imports no capability
platform/            host capabilities that are no feature's: window, dialog, database transport,
                     diagnostics, locale, appearance. host.ts keeps only these ports
api/                 tRPC wiring, context, the refusal plumbing. The root router left for app/
i18n/                the generated runtime, and en/index.ts, ar/index.ts composing each concept's
                     strings
error/               unchanged in role
<feature>/           tenant, complex (unit/), contract, payment, dashboard, workspace,
                     organization, settings, sync, update, startup
```

**A capability has the same shape as a feature** (below), plus `index.ts` as its whole API. One
with a router (history, transfer) or a host (notification, palette, shortcut's listener) declares
them through `feature.ts` and `surface.ts` like a feature and is listed in `app/` the same way; the
layer rule, not the shape, is what separates the two.

**The canonical concept shape.** Every file is optional except `feature.ts`; a file present has
this name and this job, and nothing else holds that job.

```
<concept>/
  feature.ts         defineFeature({ name, router, kind?, prefix?, transfer? }). Loads under Node
  surface.ts         defineSurface({ name, places?, create?, search?, acts?, host?, sections?,
                     settings? }). May import .svelte; imported only by app/surfaces.ts
  index.ts           what other concepts may import: types, domain functions, query hooks.
                     Re-exports only Node-loadable modules, never a component
  <concept>.ts       the domain: types and rules
  router.ts          the tRPC router, `export default`
  query.ts           every query and mutation hook, mutations through declareMutation
  acts.ts            record acts
  host.svelte.ts     host state
  host.ts, tauri.ts  the concept's host port and its Tauri adapter, where it crosses to Rust
  refusal.ts         its RefusalCode union and their fields
  i18n/en.ts, ar.ts  its strings, as plain objects importing nothing but types
  component/         its Svelte components
  <sub-concept>/     the same shape, one level down
  tests/
```

**Sub-concepts become directories**: `organization/{member,role,access,workspace,setup,session}/`,
`contract/{schedule,renewal,transfer,rank}/` (grouping the eleven flat helpers by what they serve;
the grouping is the implementer's within that list), `complex/unit/` as it is.

**Where things move.**

| From | To |
| --- | --- |
| `api/router.ts`, `api/app.ts`, `api/caller.ts` | `app/router.ts`, `app/caller.ts`; `app.ts` dissolves: `settings`, `organization` mount at the root, `remoteSync` becomes `sync`, `update` becomes the `update` concept, `bootstrap` goes to `startup`, `state.reconcile` to `contract` |
| `contract/router.ts:47,50` mounting `payment` and `dashboard` | the root, through the list |
| `layout/record-search.ts`, `create.ts`, `navigation.ts`, `destination.ts`, `palette.svelte` addresses, `breadcrumb.svelte` labels, `frame.svelte` host mounts | each feature's `surface`; the shell iterates |
| `layout/startup*`, `component/startup-*` | `startup/` |
| `layout/component/{organization-dialogs,account-menu,account-signed-out,workspace-menu,workspace-locked}.svelte` | `organization/` or `workspace/`, contributed to the shell as surface slots |
| `platform/host.ts` organization types and methods (lines 240-561, 660-980), remote sync, update, print, export, import, earlier | `<concept>/host.ts` + `<concept>/tauri.ts`; composed in `app/host.ts` |
| `settings/query.ts` sync, rename, earlier, update, restart | `sync/query.ts`, `workspace/query.ts`, `update/query.ts` |
| `workspace/permission.ts` | `permission/` |
| `history/history.ts` | stays in the `history` capability, which `mutation` imports through its `index.ts` (sideways, layer 2); `HistoryConcept` derived from `RECORD_KINDS` |
| the zod schemas in `platform/database/schema.ts` that use tenant's validators | `tenant/` |
| `api/date.ts` + `design/date.ts`; `api/period.ts` + `payment/period.ts`; `api/search.ts` + `platform/database/search.ts` | `date/` for dates and periods; search becomes `palette/`'s, with the SQL matching helper kept in `platform/database/search.ts` because it is the transport's |
| `common.refusals.<concept>` and each concept's namespace in the locale files | `<concept>/i18n/{en,ar}.ts`, composed back at the same key path |

## Rust, `apps/desktop/tauri/src/`

```
lib.rs               plugins in order, one line each, and the app .setup for what must run after
                     the window exists
error.rs  http.rs  persisted.rs
clock/               port: Clock trait, system and fixed adapters (was timestamp.rs + ambient reads)
credential/          port: CredentialStore trait, OS keyring and in-memory adapters (was keyring.rs)
diagnostics/         plugin "diagnostics", registered first so later failures are recorded
window/              plugin "window"
settings/            plugin "settings"
update/              plugin "update"
print/               plugin "print"
database/            plugin "database" (commands.rs → command.rs)
transfer/            plugin "transfer": the whole-workspace workbook (export.rs, import.rs)
backup/              the copy before a change of shape; no commands (schema.rs joins it)
machine/             this machine's record (was sync/store.rs RemoteSyncStore): what it holds
turso/               the Turso adapter: platform, consent, discovery, oauth (was sync/turso, sync/oauth)
sync/                plugin "sync": the workspace replica and its credential only
organization/        plugin "organization"
  act.rs             the signed-in check, the pull and the machine lock, done once
  store/             OrganizationStore: one type, one impl block per sub-concept file, each
                     sub-concept's tables beside its methods
  member/ role/ invitation/ workspace/ ownership/ session/ setup/ authority/ mark/ lease/
upgrade/             plugin "upgrade": everything that brings a 0.12-0.15 install forward
  records.rs         was earlier.rs, reading 0.12 and 0.13's app.db
  format/            was organization/transition/ + upgrade.rs, and format-one signing from
                     authority.rs
  shape.rs           the old-shape machine record reads and organization/forget.rs's startup check
startup/             plugin "startup": bootstrap
```

`state.rs` and `AppState` go: each plugin manages its own state in its `setup`, and a command
reads another plugin's state by type (`State<T>` is application-wide). `organization/migrate.rs`
becomes `organization/lease/apply.rs` beside the lease it runs under; `mark.rs` keeps its name
inside `organization/mark/` where the directory says what it marks.

# Interfaces

## The feature contract

```ts
// feature/feature.ts
export type Feature<N extends string, R extends AnyRouter> = {
	name: N;               // the router key, and the i18n and cache namespace
	router: R;
	kind?: RecordKind;     // present on the five record features
	prefix?: string;       // workspace query-cache prefix
	transfer?: Transfer;   // sheet name, columns, import order, reader and writer
};
export const defineFeature = <const N extends string, R extends AnyRouter>(f: Feature<N, R>) => f;
export type RoutersOf<F extends readonly Feature<string, AnyRouter>[]> =
	{ [K in F[number] as K['name']]: K['router'] };
export function routersOf<const F extends readonly Feature<string, AnyRouter>[]>(f: F): RoutersOf<F>;
```

**Verified 2026-09-28 against tRPC 11.18.0** in a scratch project: `router(routersOf(features))`
type-checks procedure inputs and outputs, and an unlisted feature is a type error at the caller.

```ts
// feature/surface.ts
export type Surface = {
	name: string;
	places?: NavigationPlace[];          // sidebar, trail, breadcrumb label, route
	create?: CreateEntry;                // the palette's create group entry
	search?: SearchEntry;                // the palette's record group
	acts?: readonly RecordAct<any>[];
	host?: Component;                    // mounted once by the frame
	sections?: Section[];                // { on: RecordKind | 'settings' | ..., order, component }
	slots?: ShellSlot[];                 // account menu, workspace menu and the like
};
```

The shell reads `surfaces` for every list it draws. Order is the list's order, and a `Section`
carries `order` within the page it targets.

## How a capability is configured

A capability that needs what features declare exports a builder, and `app/` calls it once with
the lists. It never imports `app/`.

```ts
// app/router.ts
export const appRouter = router({
	...routersOf(features),
	transfer: transferRouter(features.flatMap((f) => (f.transfer ? [f.transfer] : [])))
});

// app/surfaces.ts
export const palette = createPalette(surfaces);     // palette/ reads search, create, acts
export const cachePolicy = createCachePolicy(features); // mutation/ reads each prefix
```

A feature talks to a capability the other way round, through its API, and declares what it hands
over in its own `feature.ts` or `surface.ts`:

```ts
// tenant/query.ts
import { declareMutation } from '$lib/mutation';
export const useDeleteTenant = declareMutation({ touches: ['tenants'], inverse, history });
```

Undo is the worked case the human named: the stacks, the inverse, the shortcut and the toast's
undo action all live in `undo/`; `mutation/` calls `undo.record(...)` when a declaration carries an
`inverse`; nothing else in the tree knows how undo works.

## tRPC paths

The root router is flat: `payment.*`, `dashboard.*`, `settings.*`, `organization.*`, `sync.*`
(was `app.remoteSync.*`), `update.*` (was `app.update.*`), `startup.bootstrap` (was
`app.bootstrap`), `contract.reconcile` (was `app.state.reconcile`). Every caller of a moved path
changes in the ticket that moves it. Procedure paths are not persisted: history stores a render key
(`platform/database/schema.ts:221-232`) and undo lives in the session; the ticket that flattens the
router greps diagnostics and the Rust side for a recorded path first.

## Tauri IPC

Every command becomes `plugin:<plugin>|<command>`. **A command's Rust name is
`<sub-concept>_<act>` and unique in the crate**, since `#[tauri::command]` exports a macro at the
crate root per function and two `get`s collide; the plugin supplies the feature, so
`organization_member_invite` is invoked as `plugin:organization|member_invite`. Plugin names are
ASCII letters, digits and hyphens (the capability identifier rejects underscores).

**The ACL arrives for the first time.** `build.rs` calls bare `tauri_build::build()` today, so
application commands are not checked. Plugin commands are, by exact name. `build.rs` registers
each plugin with `InlinedPlugin::new().commands(..).default_permission(AllowAllCommands)` and
`capabilities/default.json` lists `"<plugin>:default"`. **The command list is derived, not kept**:
`build.rs` reads each plugin's `generate_handler![...]` from its `plugin.rs` (the same text parse
`every_organization_command_names_its_gate` does of `lib.rs` today), and a Rust test asserts the
derived list equals the handler's. No command is `cfg`-gated today; the test fails if one becomes
so.

**Plugin setup runs before any window exists** (`app.rs:2607` against `:1441`). The launch-link
path shows the hidden main window, so it stays in the app's `.setup` or moves to the organization
plugin's `on_event(Ready)`, never into a plugin `setup`. Single-instance registers first and
deep-link before any plugin calling `app.deep_link()`, as now.

## Ports

- `credential::CredentialStore` (`get`, `set`, `delete` by account), adapters `Os` and `Memory`.
  Managed with `Builder::manage` before the plugins, so every plugin's setup can read it. Tests
  construct `Memory` per test, which ends the serialisation on `take_the_credential_store()`.
- `clock::Clock` (`now() -> Timestamp`), adapters `System` and `Fixed`. Managed the same way. The
  34 commands that pass `now` down read it from the clock at the command edge.
- The organization act helper:

  ```rust
  pub async fn as_member<T>(
      state: &OrganizationState,
      machine: &MachineState,
      clock: &dyn Clock,
      act: impl AsyncFnOnce(&mut Acting<'_>) -> Result<T>,
  ) -> Result<T>
  ```

  `Acting` carries the signed-in session, the pulled store and `now`. It runs the check, the pull
  and the lock in the order `organization/command.rs` runs them today; a command whose order
  differs keeps its own and says why.

# Data Model

No data at rest changes. The spellings that stay as they are and are only moved: the history
`concept` values (now derived from `RECORD_KINDS`, which lists the same five), the permission bits,
the machine record's serde names including `"googleDrive"`, `"hosted"` and `controlPlaneSession`
(which move into `upgrade/shape.rs`), every table and column, and the locale key paths.

# Technical Approach

Each numbered step is one or more tickets, and every ticket passes the integration gate alone.
The order is chosen so each move lands on ground already cleared, and so the guard that proves a
move is in place before the move.

1. **Guards first, in ratchet mode.** The TypeScript dependency test (cycles between concepts,
   the four-layer rule (no upward import, no cycle, no import past another module's `index.ts`), deep imports past a
   concept's `index.ts`) and the Rust top-level module cycle test land reporting today's
   violations as a checked-in baseline that may only shrink. A move that removes a violation
   deletes its baseline line in the same commit; a move that adds one fails. The baseline is empty
   by the end. *Why first: every later ticket is measured by it, and a guard that arrives last
   proves nothing about the moves before it.*
2. **Dead code out** (requirement 16). A smaller tree is cheaper to move.
3. **Capabilities**: `permission/`, `date/`, `mutation/`, `undo/`, `history/`, `shortcut/`,
   `notification/`, `act/`, `create/`, `list/`, `form/`, `transfer/` out of `design/`, `error/` and
   `workspace/`, one ticket per capability; the zod schemas off
   `platform`, one date, period, refusal and search module, one test harness per runner. These
   are what features and the shell will import, so they settle before either moves.
4. **The composition root and the contract**: `feature/`, `app/`, the flat router from the list,
   `RecordKind` and `HistoryConcept` derived, `platform/host.ts` split into concept ports composed
   in `app/host.ts`.
5. **Surfaces**: each feature's `surface`, the shell iterating them, sections replacing every
   cross-concept component import, settings sections, `layout` → `shell`, `startup/` out, the four
   fat routes delegating. One ticket per shell list, so each is reviewable alone.
6. **Concept shape**: per-concept i18n, sub-concept directories for organization and contract,
   `settings/query.ts` split, `declareMutation` everywhere, the oversized files split, `index.ts`
   per concept.
7. **Rust restructure, before plugins**: `clock/` and `credential/` ports, `turso/` and `machine/`
   out of `sync/` (the cycle breaks here), error unification, the renames, `organization/` split
   with `act.rs` and the partitioned store, `upgrade/` isolated. *Why before plugins: a plugin
   wraps a module, and wrapping one that then moves is two IPC renames where one does.*
8. **Rust plugins**: one ticket per plugin, each moving its commands, its state and its TS
   adapter's invoke strings together; the ACL derivation lands with the first. `state.rs` goes
   with the last.
9. **Governance** closes each step rather than trailing it (the constraint in `spec.md`); the last
   ticket writes what adding a feature touches and the naming lint.
10. **The feature context** (requirement 21), last of all: `contexts/desktop/feature.md`, written
    against the finished tree by reading it, never from this plan, so it describes what was built.

# Integration

- **Rules whose `paths:` globs move**: [[rules/api-layer]] (`api/**`, `*/router.ts`,
  `platform/host.ts`, `platform/tauri.ts`), [[rules/interface]] (`layout`, `dashboard`,
  `contract`), [[rules/credentials]] (`sync/**`, `organization/**` both sides),
  [[rules/data]], [[rules/migrations]] (`organization/transition/**` → `upgrade/format/**`),
  [[rules/frontend]], [[rules/module-layout]], [[rules/testing]]. Each is rewritten in the commit
  that moves its subject. [[rules/api-layer]]'s *every invoke belongs in the Tauri facade* becomes
  *every invoke belongs in its concept's `tauri.ts` adapter*.
- **Contexts**: [[contexts/repository]] (the homes, the concept list, `layout`), and each
  `contexts/desktop/*` whose `paths:` move.
- **Tests that read source as text**: `api/tests/boundaries.test.ts`, `api/tests/flags.test.ts`,
  the design package's and the desktop's convention tests, `organization/tests/router.test.ts`
  (reads `GATES` from `organization/command.rs`), `every_organization_command_names_its_gate`
  (reads `lib.rs`), `roles.test.ts` (records command strings), the permission parity test (reads
  `packages/workspace-permission/index.ts`). Each follows its subject in the same commit.
- **`drizzle.config`** keeps pointing at `platform/database/schema.ts`.
- **`.typesafe-i18n.json`** is unchanged; the base locale imports each concept's file with a `.js`
  extension, which the generator needs and bundler resolution maps to `.ts`. Verified 2026-09-28
  in a scratch copy: a namespace moved to `src/lib/dashboard/i18n/en.ts` regenerates identical
  types, and a key renamed there appears in `i18n-types.ts`.
- **`turbo.json`**, the root `package.json`, `pnpm-workspace.yaml` lose `turso-platform`.

# Migration

Nothing a user holds changes: no workspace migration, no organization format, no stored file. What
already exists in the tree moves under the rules above. The design package loses its unused
families; a consumer wanting one runs the shadcn-svelte CLI, which writes into the package.

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1 | a test that `RecordKind` and `HistoryConcept` are `typeof RECORD_KINDS[number]`, and the dependency test's rule that no file but `permission/` declares either |
| 2 | the dependency test: a file outside `app/` importing a feature it is not part of, or containing a kind literal, fails. The add-a-feature list is written by step 9 and checked by adding a throwaway kind in a scratch branch during that ticket |
| 3 | `app/tests/router.test.ts`: every key of `appRouter._def.record` is a feature name, no router value contains another feature's router |
| 4, 5 | the dependency test, baseline empty; the Rust module test, baseline empty. Both in the integration gate |
| 6 | the dependency test checks each concept's files against the canonical names; deviations listed in [[rules/module-layout]] |
| 7 | the dependency test's home rules; a grep in review for `organization` types in `platform/host.ts` |
| 8 | `pnpm check` (typesafe-i18n's generated types carry both locales' keys); a test that `i18n/{en,ar}/index.ts` contain only imports and the composed object |
| 9 | the Rust test that `lib.rs` contains no `generate_handler!` and no `#[tauri::command]` path; `state.rs` absent |
| 10, 11 | the Rust module test (no `sync` → `organization`, no `organization` → `sync::` internals); a test that no `organization` command body calls `signed_in(` |
| 12 | a Rust test scanning production sources for `cfg(test)` switches in `credential/` and for `SystemTime::now` outside `clock/` |
| 13 | the dependency test's single-module rules; a Rust lint test for `Result<_, String>` and error enums beside `error::Error` |
| 14 | the naming test: one-word Rust files, banned names from [[rules/module-layout]], singular directories |
| 15 | the Rust module test: only `startup` and `organization/session` import `upgrade`; the upgrade tests pass with assertions unchanged |
| 16 | `knip` run once in the dead-code ticket to confirm nothing unimported remains (not added to the gate); `turbo run test --dry` lists no `turso-platform` task |
| 17 | review against the survey's list; routes checked by the dependency test's rule that a `routes/` file imports only `$lib/*/component` and `$lib/app` |
| 18 | `validate.mjs`; a test that every rule's `paths:` glob matches at least one file |
| 21 | `validate.mjs` (frontmatter, links); a check in that ticket that every path the context names exists |
| 20 | the dependency test's layer rule (no capability imports a feature); a test per capability that its API is its `index.ts` and no file outside it imports its internals; review against the capability list above |
| 19 | the integration gate on every commit; `drizzle-kit generate` producing no migration, run in the gate's check step for this effort's tickets; existing assertions unchanged except moved paths, which review checks by diffing each test file's assertions |

**No new test framework and no new dependency** for the guards: they are `node --test` files
reading the tree, the pattern `api/tests/boundaries.test.ts` already uses, and Rust tests reading
`src/` the way `every_organization_command_names_its_gate` reads `lib.rs`. `knip` runs once by
`pnpm dlx` and is not added.

**Tests move with their subject and keep their assertions.** A split that moves logic keeps the
test that covered it pointing at the new home; where a moved path has no test, the ticket writes
one before moving it.

# Operational Considerations

- The running application has to be checked by a person once the plugins land, on the paths a
  test cannot drive: a link launch while closed and while open, the updater, printing, the vault
  unlock. Held for the close, as [[rules/testing]] and the human's standing preference say.
- The effort is long. Other efforts opened meanwhile will conflict; a restack after each merge to
  `main` is part of every ticket that follows one.

# Technical Risks

- **A rule silently stops loading** when its directory moves. Shows as a reviewer finding a broken
  convention in a moved file; the glob-matches-a-file test catches it.
- **An ACL refusal at runtime** for a command the derived list missed. Shows as `Command
  plugin:x|y not allowed by ACL` in the running app; the list-equals-handler test is the guard,
  and the human check at the close exercises every plugin.
- **Plugin setup ordering**: a plugin reading state a later plugin manages panics at launch.
  Shows at the first `cargo tauri dev`; state shared across plugins is managed by `Builder::manage`
  before any plugin, and the order in `lib.rs` is documented beside it.
- **A reordered side effect inside a split** (lock, pull, reconcile). The act helper preserves
  today's order; every organization command's existing test runs through it.
- **Svelte initialisation order through `index.ts`**: a barrel that re-exports rune modules can
  evaluate a module before its dependency. Shows as `undefined` at import in a component test;
  `index.ts` re-exports only plain modules, and host state is reached through `surface`.
- **The design package's `./*` export** means removing a family could break an import this survey
  missed. `pnpm check` and the build fail on it at once.
