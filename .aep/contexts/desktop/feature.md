---
paths:
  - apps/desktop/src/lib/app/**
  - apps/desktop/src/lib/feature/**
  - apps/desktop/tauri/src/lib.rs
  - apps/desktop/tauri/src/*/plugin.rs
  - apps/desktop/tauri/build.rs
  - apps/desktop/tauri/capabilities/default.json
use-when: "adding, removing or changing a feature, a record kind or a capability, on either side of the IPC boundary"
---

# Feature

How a feature and a capability are declared, registered and composed, how one reaches another,
and what adding or removing one touches, in the TypeScript tree and in the Rust crate. Every
`src/…` and `tauri/…` path is relative to `apps/desktop/`, as [[contexts/repository]] says.

*Written on 2026-09-29 against the finished tree of
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]] (ticket 59, criterion 21). Where
this and the source disagree, the source is right and this is corrected.*

[[rules/module-layout]] is the authority for the shape of a concept, the layer rule, the table of
departures, and the file-by-file list of what adding a feature or a kind edits. This context
explains how the pieces fit and points at where each one is read; it does not repeat those tables.

## Language

**Feature**:
A concept that holds something a person uses: a record kind (`tenant/`, `complex/` with
`complex/unit/`, `contract/`, `payment/`), a screen (`dashboard/`), or an area of the application
(`workspace/`, `organization/`, `settings/`, `sync/`, `update/`, `startup/`). Layer 3. A home is a
feature because `app/features.ts` or `app/surfaces.ts` imports its declaration; nothing else places
it.

**Capability**:
A mechanism every feature shares (`permission/`, `mutation/`, `undo/`, `history/`, `shortcut/`,
`notification/`, `palette/`, `create/`, `act/`, `list/`, `form/`, `transfer/`, `print/`,
`date/`). Layer 2. It imports no feature; what it needs of the features it is handed by `app/`.
Its layer is set by hand in the `PLACED` map of `src/lib/tests/layers.test.ts`.

**Declaration**:
A concept's `feature.ts` (`defineFeature`, loads under Node: name, router, kind, prefix, pages,
transfer, contributes) and its `surface.ts` (`defineSurface`, the window's half: record, places,
create, search, acts, host, sections, slots, contributes). Only `app/` reads either. The contracts
and their doc comments are `src/lib/feature/feature.ts` and `src/lib/feature/surface.ts`.

**Entry**:
The two files another concept may import: `index.ts` (what loads under Node) and `ui.ts` (what
only the window loads: query hooks, rune state, the few shared components). Anything past them is
private.

**Composition root**:
`src/lib/app/`, the one place that names every feature. Its two lists are `app/features.ts` and
`app/surfaces.ts`; the other files build what the caller, the shell and the capabilities are handed
from those lists.

**Section**:
Something a feature draws on a page another feature owns: a record's page, by its kind, or the
settings area (`Section` in `feature/surface.ts`). A route asks `sectionsOn(<target>)` in
`app/surfaces.ts` and hands the result to the page's component.

**Slot**:
Something a feature draws at one of the shell's own places: `workspace-menu`, `account-menu`,
`dialogs` (`ShellSlot` in `feature/surface.ts`, gathered by `slotsAt` in `app/surfaces.ts`).

**Contribution**:
What a depended-on feature needs of a feature depending on it, declared as a type by the one in
need and supplied as a value by the other under `contributes`. Two maps name every need:
`Contributions` (read by routers as `ctx.contributions`) and `SurfaceContributions` (read in the
window through `contributionsTo`), both in `app/contributions.ts`.

**Host port**:
What a feature or capability asks of the Rust shell, as a type in its `<concept>/host.ts`, with its
Tauri adapter in `<concept>/tauri.ts`. `app/host.ts` composes every port with the platform's part
(`platform/host.ts`, `platform/tauri.ts`) into the one `Host`.

**Plugin**:
A Rust feature, served as an inline Tauri plugin from `tauri/src/<feature>/plugin.rs` and invoked
from the webview as `plugin:<name>|<command>`.

## Where to look

| To understand | Start at |
| --- | --- |
| what a feature may declare | `src/lib/feature/feature.ts` |
| what a surface may declare, sections, slots, glyphs | `src/lib/feature/surface.ts` |
| the list of features and the order of invalidation | `src/lib/app/features.ts` |
| the list of surfaces, the order of hosts, places, the palette | `src/lib/app/surfaces.ts` |
| the root router | `src/lib/app/router.ts` |
| the caller every procedure is called through | `src/lib/app/caller.ts`, `src/lib/api/caller.ts` |
| what a router reads of other features | `src/lib/app/contributions.ts`, `src/lib/api/contribution.ts` |
| the host the API runs over | `src/lib/app/host.ts` |
| the query-cache policy | `src/lib/app/cache.ts`, `src/lib/mutation/cache.ts` |
| the workspace file's sheets | `src/lib/app/transfer.ts`, `src/lib/transfer/feature.ts` |
| the order the root layout wires these in | `src/routes/+layout.svelte` |
| where the frame mounts hosts and the fixed capabilities | `src/lib/shell/component/frame.svelte` |
| the layer rule, as a test | `src/lib/tests/layers.test.ts`, `src/lib/tests/layers.baseline.txt` |
| the plugins and their order | `tauri/src/lib.rs` |
| how a command list reaches the ACL | `tauri/build.rs`, `tauri/capabilities/default.json`, `tauri/src/guard/acl.rs` |
| the crate's module graph and names | `tauri/src/guard/cycle.rs`, `tauri/src/guard/naming.rs` |

## How the TypeScript side composes

**The root layout wires the composition root before anything renders.** `src/routes/+layout.svelte`
imports `app/caller`, `app/cache`, `app/transfer` and `app/surfaces` first, each of which binds or
provides once as it is evaluated:

- `app/router.ts` builds `appRouter` from `routersOf(features)`, every router mounted at the root
  under its feature's name, binds the merged `contributions` into `api/contribution.ts`, and binds
  every feature's refusal fields (`app/refusal.ts`) into `error/refusal.ts`.
- `app/caller.ts` binds that router's caller and `app/host.ts`'s host into `api/caller.ts`. A
  feature calls its own procedures through the default export of `$lib/api/caller`
  (`tenant/query.ts` is one), which knows the router only by its type.
- `app/cache.ts` builds the cache policy from `features` (each one's `prefix`) and provides it to
  `mutation/`, and the shared prefix to `history/`.
- `app/transfer.ts` binds the list into `transfer/`.
- `app/surfaces.ts` merges every surface's `contributes` and provides it to `feature/surface.ts`,
  provides every kind's glyph the same way, and builds `palette` from the surfaces' `search`,
  `create` and `acts`.

**The shell draws what the surfaces declare and names no feature.** The frame mounts each
surface's `host` in the order of `app/surfaces.ts`, which is load-bearing (the workspace's
permissions first, then the command menu's host, where the frame drew the menu before effort 840). The rail and the command menu read `places`. A route such as
`src/routes/tenants/[id]/+page.svelte` asks `sectionsOn('tenant')` and hands the sections to the
tenant's own component.

**The Node half and the window half stay apart.** `feature.ts` and `index.ts` load under Node, so
the root router, the cache policy and the transfer build in Node tests; `surface.ts` and `ui.ts`
may import components and runes.

## How one feature reaches another

- **Through an entry.** A feature imports another's `$lib/<concept>` or `$lib/<concept>/ui`, and
  never a file past them. The tenant's kind leaves it as `TENANT_KIND` from `tenant/index.ts`, and
  its reads a contract's page draws leave it from `tenant/ui.ts`. A type is reached the same way,
  whether or not the import is erased: one another concept names is exported from `index.ts`. The
  one exemption is a type read up from the composition root, `app/`, which is how the client, the
  contract and the capabilities are typed from the list.
- **One way.** Record features depend one way: the contract on the tenant and the unit, the
  payment on the contract. Where the depended-on side needs something back it declares the need as
  a type and the depending side contributes it, in `feature.ts` for a router and in `surface.ts`
  for the window. `contributionsOf` in `feature/feature.ts` merges them and refuses a member given
  twice; a member nobody gives fails the type check in `app/contributions.ts` or
  `app/surfaces.ts`. Both are read at call time, never held at import.
- **On another's page, as a section.** A feature never hands over a component for another to
  render; it contributes a `Section` with `on` naming the page.
- **At the shell, as a slot**, handed that place's props.
- **Across to Rust, through its port.** A router reaches its feature's part of the host as
  `ctx.host.<feature>`; the platform's own part sits at the top of `Host`.
- **Procedure paths are the feature and then the procedure** (`payment.get`, `sync.getState`),
  because no router mounts another.

## How a capability is configured

A capability that needs what features declare exports a builder or a `provide`/`bind` function,
and `app/` calls it once with the lists; the capability never imports `app/`. In the tree:

| Capability | Configured by | With |
| --- | --- | --- |
| `mutation/` | `app/cache.ts` | `createCachePolicy(features, contract)`, then `provideCachePolicy` |
| `history/` | `app/cache.ts`, `app/features.ts` | `provideHistoryPrefix`; and its own `feature.ts` for its router |
| `transfer/` | `app/features.ts`, `app/transfer.ts`, `app/host.ts` | `transfer(declared)` builds its feature and router from every declared sheet; `bindTransfer(features)`; its port |
| `palette/` | `app/surfaces.ts`, `shell/component/frame.svelte` | `createPalette(surfaces)`; its `surface.ts` host in the list; the frame hands that host the menu and the places through `providePalette` |
| `print/` | `app/host.ts` | its port only |

**Some capabilities take nothing from `app/`.** A feature uses them through their API, and the
frame mounts the ones with something fixed on screen through their `ui.ts` (notification, print,
shortcut, create and undo, the departure [[rules/module-layout]] records). The command menu is the
one mounted as a host instead, from its `surface.ts`, so it keeps its place among the others. The list is
one: a feature imports its filters and props types from `list/index.ts` and draws the list, its bar
and its search from `list/ui.ts`.

## The layer rule

Four layers, and imports point down or sideways through an entry, never up and never in a cycle:
composition (`app/`, `shell/`, `prototype/`, `src/routes/`), features, capabilities, foundation
(`feature/`, `design/`, `platform/`, `api/`, `i18n/`, `error/`). [[rules/module-layout]] states it;
`src/lib/tests/layers.test.ts` holds it as six kinds of line (`upward`, `cycle`, `deep`, `import`,
`literal`, `route`) against `layers.baseline.txt`, which only shrinks. A home the test can place
neither by hand nor from the two lists fails its first test.

The crate has its own: `tauri/src/guard/cycle.rs` holds the top-level modules to no cycle and to
its `RULES` (`sync` names nothing of `organization`, nothing names `upgrade`) against
`cycle.baseline.txt`; `guard/naming.rs` holds names to one word; `guard/acl.rs`, `guard/clock.rs` and `guard/error.rs`
keep no baseline.

## How the Rust side composes

**`tauri/src/lib.rs` composes and does nothing else.** It manages the two ports every plugin's
setup may read, the credential store (`tauri/src/credential/`) and the clock
(`tauri/src/clock/`), then registers single-instance, then each feature's plugin in the order their
setups build state (`diagnostics` first, `organization` after `settings`, `database`, `sync`,
`update` and `upgrade`), then the third-party plugins, then a `.setup` for what needs a window.
`guard/acl.rs` holds that it registers every plugin, `diagnostics` first, manages nothing after the
first plugin, and handles no command.

**A plugin is `tauri/src/<module>/plugin.rs` beside the module's `mod.rs`**: `Builder::new("<name>")`, one
`generate_handler!` of plain `super::` or `crate::` paths, and a `setup` where it manages state
(`tauri/src/upgrade/plugin.rs`) or none (`tauri/src/print/plugin.rs`). A command function is named
`<module>_<act>` and answers to `<act>` through `#[tauri::command(rename = "<act>")]`. The name is
usually the module's (the window module's is `frame`), and never one of Tauri's core plugins' nor
one `lib.rs` registers from a crate (deep-link, opener, dialog, fs, updater, single-instance): the
plugin store keeps only the later of two plugins sharing a name, and `guard/acl.rs` refuses both.

**The ACL list is derived.** `tauri/build.rs` reads every `src/<module>/plugin.rs`, registers it as
an inline plugin whose `default` permission allows exactly the handler's commands, and writes the
list for `guard/acl.rs` to hold against the handler. `tauri/capabilities/default.json` grants
`"<name>:default"`.

**A port keeps a module from naming another.** Besides the clock and the credential store, the
organization's session reaches the upgrade through the `Upgrade` trait in
`tauri/src/organization/session/mod.rs`, which the `upgrade` plugin manages an implementation of in
its setup, so nothing in the crate names `upgrade`.

**The two sides meet at the port.** A TypeScript feature that crosses has a `<concept>/host.ts` and a
`<concept>/tauri.ts` whose calls invoke `plugin:<name>|<command>` (`print/tauri.ts` against
`tauri/src/print/`, `sync/tauri.ts` against `tauri/src/sync/`). A port may invoke another plugin's
command where the Rust side keeps it elsewhere, and three ports do:

- `sync/tauri.ts` invokes the organization plugin's `session_replicate` and `workspace_rename`,
  because in the crate both act on the organization and `sync` names nothing of it, while in
  TypeScript replication and the rename are sync's.
- `workspace/tauri.ts` invokes the upgrade plugin's `earlier_find` and `earlier_read`, because the
  crate keeps the read of what 0.12.0 and 0.13.0 left in `app.db` with everything else that brings
  an earlier install forward (`tauri/src/upgrade/`), so that one step removes it, while TypeScript
  has no upgrade concept: offering those records and bringing them in through the import is the
  workspace's (`workspace/app-database.ts`).
- `platform/tauri.ts` invokes the settings plugin's `get` for the diagnostics folder, because the
  crate holds that folder among the settings (`diagnostics_dir` in `tauri/src/settings/mod.rs`),
  while the screens that open it are no feature's, and the platform, a foundation, cannot reach
  the settings feature's port a layer above it.

[[rules/module-layout]] records each among the departures. A record feature has no plugin of its
own: its SQL reaches Rust through the database plugin, from `platform/database/client.ts`.

## Adding and removing

Each of these is the whole list of kinds of edit; the file-by-file tables are
[[rules/module-layout]], under *What adding a feature touches*.

**A feature with no kind, TypeScript side.**

1. Its directory under `src/lib/`, in the canonical shape: `feature.ts` always, and `surface.ts`,
   `index.ts`, `ui.ts`, `router.ts`, `i18n/en.ts`, `i18n/ar.ts` as it needs them.
2. Its declaration in `app/features.ts`, and its surface in `app/surfaces.ts` where it draws
   anything (and in `places` there where the rail or the menu offers it). Being listed is what
   gives its home layer 3.
3. Its port in `app/host.ts`, a member of `Host` and one of `host`, where it crosses to Rust; the
   port's type leaves its home through `index.ts`.
4. Its contributions: a need is a member of the kind's type in `app/contributions.ts`; a value is
   under `contributes` in its own declaration.
5. Its refusals, where it raises any: its `refusal.ts`, with the codes and the field of its form
   each belongs under, exported from its `index.ts`, and a member of `RefusalCode` and a spread in
   `refusalFields` in `app/refusal.ts`, which `app/router.ts` binds into `error/refusal.ts`.
6. Its strings composed in `src/lib/i18n/en/index.ts` and `src/lib/i18n/ar/index.ts`, then `pnpm i18n`.
7. Its routes under `src/routes/`, importing only components, `ui.ts` and `app/`.

**A kind of record** is all of the above plus the permission package
(`packages/workspace-permission/index.ts`) and its mirror
(`tauri/src/organization/role/permission.rs`), the table in `src/lib/platform/database/schema.ts`
with the desktop's `pnpm db:generate`, and the refusal and role-editor strings. Its glyph, its refusal of a write
without viewing, its layer and the root router's test follow from the declaration. A kind's flags
sit in stored role masks, and its table in the workspace's schema, so both are data at rest.

**A feature, Rust side.**

1. `tauri/src/<feature>/mod.rs` and `tauri/src/<feature>/plugin.rs`.
2. `pub mod <feature>;` and `.plugin(<feature>::plugin())` in `tauri/src/lib.rs`, placed by what
   its setup reads.
3. `"<plugin>:default"` in `tauri/capabilities/default.json`, where `<plugin>` is the name in its
   `Builder::new(..)`: no core plugin's and none `lib.rs` registers from a crate.

No command is listed anywhere else.

**A capability.** Its directory under `src/lib/`, its layer in `PLACED` in `layers.test.ts`, and,
where it needs what features declare, the call in `app/` that hands it the list.

**Removing any of these is the reverse**, and the guards say what is left: `layers.test.ts` fails
on a home with no layer and on a baseline line that no longer occurs, the type checks in
`app/contributions.ts` and `app/surfaces.ts` fail on a need nobody supplies, and `guard/acl.rs`
fails on a plugin `lib.rs` or the capability no longer names.

## Worked example: `tenant`, a record feature

| What | Where |
| --- | --- |
| the kind, the rules, and what it needs of the contracts | `src/lib/tenant/tenant.ts` (`TENANT_KIND`, `TenantContributions`, `TenantSurfaceContributions`) |
| the declaration: router, kind, prefix `['tenants']`, sheet, pages | `src/lib/tenant/feature.ts` |
| the surface: glyph, rail place, create entry, search, acts, host | `src/lib/tenant/surface.ts` |
| the entries | `src/lib/tenant/index.ts`, `src/lib/tenant/ui.ts` |
| procedures, reading `ctx.contributions.tenant` | `src/lib/tenant/router.ts` |
| queries and mutations, through the caller and `declareMutation` | `src/lib/tenant/query.ts` |
| the acts, host state, sheet, refusals, strings, components | `acts.ts`, `host.svelte.ts`, `transfer.ts`, `refusal.ts`, `i18n/`, `component/` in `src/lib/tenant/` |
| what the contract gives it | `contributes.tenant` in `src/lib/contract/feature.ts` and `src/lib/contract/surface.ts` |
| the contract's section on a tenant's page | `sections` in `src/lib/contract/surface.ts` |
| its pages | `src/routes/tenants/+page.svelte`, `src/routes/tenants/[id]/+page.svelte` |
| its lines in the root | `src/lib/app/features.ts`, `src/lib/app/surfaces.ts`, `src/lib/app/contributions.ts` |

It has no plugin: its reads and writes reach Rust through the database plugin.

## Worked example: `undo`, a capability

`src/lib/undo/` holds the session's stack of inverses (`undo.ts`), taking a change back and
applying it again and the offer an announcement carries (`move.ts`), the key pair (`key.ts`), the
rune state (`undo.svelte.ts`) and the shortcut's registration (`component/shortcut.svelte`).
`index.ts` exports `Inverse`, `recordInverse`, `announceWithOffer`, `applyUndo` and `applyRedo`;
`ui.ts` exports `UndoShortcut`.

It has no `feature.ts` and no `surface.ts`, and `app/` names it nowhere. Its one writer is
`src/lib/mutation/mutation.ts`, which calls `recordInverse` when a declaration carries an `inverse`
(`src/lib/tenant/query.ts` declares four); `src/lib/mutation/announcement.ts` carries the offer;
`src/lib/shell/component/frame.svelte` mounts `UndoShortcut` once. Nothing else knows how undo
works, and it imports nothing of `mutation/`, which keeps the two out of a cycle. Its layer is its
line in `PLACED`.

## Related

- [[rules/module-layout]]: the shape, the layer rule, the departures, what adding touches
- [[rules/api-layer]]: routers, procedures and the caller
- [[rules/frontend]]: components, pages and styling
- [[rules/credentials]]: what may cross the IPC boundary
- [[contexts/repository]]: the homes of `src/lib/` and the crate's plugins
- [[contexts/desktop/organization]]: roles and the masks a kind's flags live in
- [[contexts/desktop/persistence]]: the schema and migrations a kind's table goes through
