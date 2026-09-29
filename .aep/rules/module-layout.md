---
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - packages/design/src/**
use-when: "adding a module, a file, or a directory under src/ or tauri/src/, including throwaway prototype code"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under any of the three trees listed
  there is read, and costs nothing otherwise.

  *Prototyping* was merged in here on 2026-08-17, from its own file. It answers
  the same question this rule answers — where a file goes — for the one kind of
  file that is not meant to survive, and it carries the `mode: [prototype]` that
  file declared. Nothing was dropped or reworded; cite it as
  `[[rules/module-layout]], under *Prototype code*`.
-->

# Module layout and naming

One concept per file. Prefer a directory over a verbose filename. Prefer concise,
descriptive names over abbreviations.

**`apps/control-plane/src/` was on the paths above from 2026-08-18 (#549) until it retired on
2026-09-12** with [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]; what it knew about
Turso became `packages/turso-platform/`, which was on them in turn until effort 840 removed it,
imported by nothing, on 2026-09-28.

**`packages/design/src/` joined on 2026-08-23 with #777**, with the same carve-out: it is a
Svelte library, so the Rust sections have no subject there either. It is `src/lib/` plus
`src/tests/`, and which of the two a file goes in is [[rules/testing]]'s answer rather than
this rule's.

**`apps/desktop/src/tests/` arrived on 2026-08-27 with #811**, and it is that same second
directory rather than a new idea: the application got a component runner of its own, and a runner
needs a setup file that is scaffolding rather than a test. It holds what belongs to the runner,
and the scaffolding more than one module's tests share.
**A test still goes in a `tests/` directory under the thing it covers** — `src/lib/design/cell/
tests/` for a cell, `src/lib/shell/tests/` for a shell component — and that is unchanged.
[[rules/testing]] is the answer for which of the two, here as in the package.

A module name states a concept, so these names are not available:

| Avoid                  | Use instead                          | Why                                           |
| ---------------------- | ------------------------------------ | --------------------------------------------- |
| `utils`                | the concept's own name               | a grab-bag name invites unrelated code        |
| `common`               | `design`, `platform`, or the concept | same                                          |
| `mod.ts`               | the concept's own name               | a Rust/Deno idiom, unclear in TypeScript      |
| plural directory names | the singular                         | a directory names a concept, not a collection |

A third-party tool's configuration keys are its API, not this repository's names — where a
generator's schema fixes a key this table forbids, the key stays and only the path it
points at is chosen here.

**`tests/` is the one plural directory name here, and it is a declared exception** rather than
a hole in the row above. It holds what covers a concept rather than part of the concept, so
"a directory names a concept" is not the question it answers; the singular reads as one test;
and Rust already spends `test/` on shared scaffolding, so the two would collide.
[[rules/testing]] defines it and this is the only place it is allowed. Settled 2026-08-18 with
#559.

**A word ending in `s` is not always a plural.** Two module names end in `s` and name one thing,
so the row above does not reach them: `diagnostics/` in `tauri/src/`, and `settings/` in both
`tauri/src/` and `src/lib/`:

| Word          | Why it is not a plural                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| `diagnostics` | a field, as `physics` is: the one record of what went wrong on this machine      |
| `settings`    | the one record of how this machine is set up; there is no `setting` it is many of |

Renaming either would make the name worse, so they stand. Both naming guards read the same two
words as not plural, each from a list of its own named `UNCOUNTABLE`: `tauri/src/guard/naming.rs`
for the crate and `src/tests/naming.test.ts` for the TypeScript trees. The table and the two lists
change together. A word joins only by the same test: it names one thing, and no singular the tree
could use says it better. Settled 2026-09-29 with effort 840, ticket 52; the TypeScript guard took
the list with ticket 58, which left both naming baselines empty.

## A concept has one shape, and is entered through `index.ts`

The tree under `apps/desktop/src/lib/` is
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]'s, under *Components*, and it
holds four layers. Imports point down, or sideways through an entry, never up and never in a
cycle:

| Layer | Holds | May import |
| --- | --- | --- |
| 4 composition | `app/`, `shell/`, `prototype/`, `src/routes/` | everything below; `app/` alone reads a feature's `feature.ts`, `surface.ts` and `tauri.ts` |
| 3 features | tenant, complex, contract, payment, dashboard, workspace, organization, settings, sync, update, startup | capabilities and foundation; another feature or capability through its `index.ts` or `ui.ts` |
| 2 capabilities | permission, mutation, undo, history, shortcut, notification, palette, create, act, list, form, transfer, print, date | foundation; another capability through its `index.ts` or `ui.ts` |
| 1 foundation | `feature/`, `design/`, `platform/`, `api/`, `i18n/`, `error/` | the design package, third-party code, and one another without a cycle |

**Every concept, feature or capability, has this shape.** Every file is optional except a
feature's `feature.ts`; a file present has this name and this job, and nothing else holds that
job:

```
<concept>/
  feature.ts         defineFeature({ name, router?, kind?, prefix?, pages?, transfer?, contributes? }).
                     Loads under Node; read only by app/
  surface.ts         defineSurface({ name, record?, places?, create?, search?, acts?, host?,
                     sections?, slots?, contributes? }). May import a component; read only by app/
  index.ts           what other concepts may import under Node: types, keys, domain functions
  ui.ts              what other concepts may use that only the window can load: query hooks,
                     rune state, the few components another concept renders, re-exported by
                     name. Present only where something window-side is shared
  <concept>.ts       the domain: types and rules
  router.ts          the tRPC router, export default
  query.ts           every query and mutation hook, mutations through declareMutation
  acts.ts            record acts
  host.svelte.ts     host state
  host.ts, tauri.ts  the concept's host port and its Tauri adapter, where it crosses to Rust
  refusal.ts         its RefusalCode union and their fields
  i18n/en.ts, ar.ts  its strings, as plain objects importing nothing but types
  component/         its Svelte components, private to the concept
  <sub-concept>/     the same shape, one level down: a directory, never a filename prefix
  tests/
```

**A feature and a capability have the same two entries.** Another concept imports
`$lib/<concept>` and `$lib/<concept>/ui`, never a file past them. **A type-only import is an
import**: it goes through the same entries, a type another concept names is exported from
`index.ts`, and it points down or sideways as any import does. The one exemption is an upward type
import of the composition root, in the table below. `index.ts` re-exports only what
loads under Node, so it never carries a component, a module of runes or a query hook; `ui.ts` is
the window half, and everything else stays private. A feature showing something on another's page
contributes a section rather than handing over a component, and where a feature depended on needs
something of the one depending on it, that one contributes it (`feature/feature.ts`, under *What a
feature contributes*). A domain spread over several modules
names each for what it holds (`contract/rank/`, `startup/machine.ts`, `sync/admission.ts`), and
the names above stay reserved for their jobs.

**A kind of record is named by its own feature.** Any other module reads it from a declaration:
a feature it depends on exports its kind from its entry (`TENANT_KIND`, `UNIT_KIND`), a feature
depending on it contributes what it needs, and the families read the permission package's
`RECORD_KINDS`. A feature's `feature.ts` and `surface.ts` may spell the kinds they contribute to,
and two homes spell them by design, the ones criterion 2 of effort 840 lists among what adding a
kind edits: the schema, whose tables are named for the kinds and stored under those names, and
the locale, whose entries and generated types carry a kind's word. A kind's word that is not a
kind is no spelling of one: an option handed to an `Intl` constructor (`{ type: 'unit' }`) and a
`data-` attribute's value.

`apps/desktop/src/lib/tests/layers.test.ts` holds all of it, against a baseline that only
shrinks: an upward import, a module on a cycle, an import past an entry (`deep`), a feature
imported by a home that is neither a feature nor `app/`, a kind spelled elsewhere, and a route
importing past a component, a `ui.ts` and the composition root. A type-only import counts for the
first, the third, the fourth and the last, but for the exemption below; being erased, it is no edge
a cycle runs through. Settled on 2026-09-29 by ticket 68 of effort 840, when review round one found
the guard passing every type import while this rule named no such exemption, and for routes by
ticket 70, when review round two found the guard still passing a route's.
Decided by
the human on 2026-09-28: the list with the composition root, capabilities a layer below the
features, a capability's components through `ui.ts` when the list capability left features
importing its `component/`, and a feature's reverse needs as contributions when the record
features kept their cycles after the sections landed. On 2026-09-29, when an `index.ts` could not
both load under Node and hold the query hooks other features read, the human gave features the
same `ui.ts`.

### Where a concept departs from the shape, and why

| Where | What | Why |
| --- | --- | --- |
| notification's and undo's `index.ts` | load `svelte-sonner`, which loads under Node only where a test mocks it, as every Node test reaching them does | the toast is the whole of notification's API and the offer to take a change back is one, so nothing of either would be left to put in `index.ts` |
| notification, print, shortcut, create and undo | mounted by the frame through `ui.ts` rather than declared as a surface's `host` | the frame places each at a fixed point around the hosts: the provider outside them, the sheet beside the page, the listeners once. The palette was among them until ticket 67 of effort 840, when its host joined the list to keep its place between the workspace's and the tenant's |
| dashboard's `index.ts`, and payment's but for its refusal codes and their fields | export nothing | no concept reads either; what each hands another it contributes in its `surface.ts`, and payment's codes and fields are there for the composition root's union of them |
| any home below `app/` | imports a type of the composition root, upward: `AppRouter` and `Host` in `api/`, the contributions in `feature/` and `api/`, the feature list in `mutation/` and `transfer/`, the refusal codes in `api/` | the client, the feature contract and the capabilities that read the list are typed from the list, which only `app/` holds, and a type import is erased before anything runs, so nothing below loads the root or any feature. It is the only upward import there is: a value import of `app/` from below is still one |
| workspace's `feature.ts` | declares only its name | it has no router, no kind, no prefix and no page; what it draws is its `surface.ts` |
| a sub-concept without a `feature.ts` | organization's `member/`, `role/`, `access/`, `workspace/`, `setup/` and `session/`, contract's `assignment/`, `schedule/`, `renewal/` and the rest | its parent's router serves it and its parent's surface draws it; only `complex/unit/` declares itself, because it holds a kind of its own |
| tenant, complex, unit, contract and payment's `transfer.ts` | the sheet `feature.ts` declares under `transfer` | columns, reader and writer are long enough to be a module of their own |
| `workspace/app-database.ts` | holds the earlier records' read outside `query.ts` | the way in reads the offer, and that read loads without the mutation capability `query.ts` declares its writes through |
| `organization/dialogs.svelte.ts` | a second host state, beside `host.svelte.ts` | the dialogs the shell's `dialogs` slot draws are opened from the rail and the settings area, which share no parent |
| `settings/component/updates.svelte`, `settings/update-announcement.ts` | the update's block and its announcement sit with the settings | general is the settings' own tab, and a contributed section fills a whole tab, so nothing can place another feature's block inside it |
| `sync/tauri.ts` | invokes two of the `organization` plugin's commands, `session_replicate` and `workspace_rename`, beside the `sync` plugin's own | in Rust both act on the organization (the member's session, the sealed workspace row), and the crate's `sync` names nothing of `organization`, so the commands are the organization plugin's. In TypeScript both are sync's: the replication its workspace sync runs (`sync/workspace.ts`) and the rename its router serves as `sync.rename`, each over sync's port, so moving the two calls to the organization's port would have sync reach another feature's host. Recorded by ticket 69 of effort 840 |
| `workspace/tauri.ts` | invokes the `upgrade` plugin's `earlier_find` and `earlier_read` | in Rust the read of what 0.12.0 and 0.13.0 left in `app.db` is `upgrade/record.rs`, with everything else that brings an earlier install forward, so a release that no longer carries those installs removes it in one step (requirement 15 of effort 840). TypeScript has no upgrade concept: offering those records and bringing them in through the import is the workspace's (`workspace/app-database.ts`), and the calls moved to its port from the platform facade earlier in effort 840. Recorded by ticket 70 of effort 840 |
| `platform/tauri.ts` | invokes the `settings` plugin's `get` for the diagnostics folder, beside the `frame` and `diagnostics` plugins' own | in Rust the folder is one of the settings (`diagnostics_dir` in `settings/mod.rs`), so `get` is what reports it. The screens that open the folder are no feature's, and the platform is a foundation, which cannot reach the settings feature's port a layer above it, so its diagnostics port asks the same command for that one field. Recorded by ticket 70 of effort 840 |
| `startup/ui.ts` | re-exports `useStartup` and `THE_WAY_IN`, which `index.ts` exports as well | a route may import a feature's `ui.ts` but not its `index.ts`, and the first run's and the join screen's routes hand both to the organization's screens, which cannot reach startup back. They sat in `app/wall.ts` until ticket 69 of effort 840, which made the composition root a pass-through for them |
| the organization's session, invitation, member and setup tests in the crate | construct `crate::upgrade::Upgrader`, where nothing else names `upgrade` | they drive the real sign-in, resume and connect over an organization of an earlier format, which is the upgrade's to bring forward, so they need its implementation behind the session's `Upgrade` port rather than a stand-in; test code is outside `guard/cycle.rs`'s graph. The modules are `organization/session/{command,forget,heartbeat,replica}.rs`, `organization/invitation/join.rs`, `organization/member/removal.rs` and `organization/setup/connect.rs`. When `upgrade` is removed, each hands the port a no-op. Recorded by ticket 69 of effort 840 |

## What adding a feature touches

A feature is added in its own directory and listed in the composition root; what else it edits by
hand is below, and nothing more. Criterion 2 of
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]] allows a record kind the list, the
permission package and its Rust mirror, the schema, its routes and its locale entries, and the
table is exactly that set. It was checked by adding a throwaway kind, `parcel`, with a router, a
feature, a surface, a page and strings, running the gate, and taking it out again: first on
2026-09-29 by ticket 58, which found four more files, and again the same day by ticket 63 once
each of the four read the kind's declaration or the one list instead of naming the kinds.

**A kind of record.** Inside `src/lib/<kind>/`: `<kind>.ts` with its `<KIND>_KIND`, `feature.ts`,
`surface.ts` with its `record: { kind, glyph }`, `index.ts`, `router.ts`, `i18n/en.ts`,
`i18n/ar.ts`, its components, and the rest of the shape above as it needs them. Outside it:

| File | What it gains |
| --- | --- |
| `src/lib/app/features.ts`, `src/lib/app/surfaces.ts` | the feature and the surface in their lists, and the surface in `places` where it has a row on the rail. `app/contributions.ts` as well, where it contributes to a kind or is contributed to, and `app/refusal.ts`, its refusal codes in `RefusalCode` and the fields they belong under in `refusalFields` |
| `packages/workspace-permission/index.ts` | its four flags on free bits, its family in `FAMILIES`, its writes in `WRITE_FLAGS`, and what the member role holds of it. `RECORD_KINDS`, `RecordKind`, `HistoryConcept` and the history `concept` values follow from `FAMILIES` |
| `tauri/src/organization/role/permission.rs` | the same, mirrored: `Flag`, `Family` and their `ALL`, names and bit ranges, `WRITE_FLAGS`, `RECORD_FLAGS`, `MEMBER_ROLE` |
| `src/lib/platform/database/schema.ts` | its table; `pnpm db:generate` in `apps/desktop` (`pnpm db:generate:desktop` from the root) writes the migration into `packages/workspace-migrations/` |
| `src/routes/<kinds>/` | its pages, each delegating to its components |
| `src/lib/i18n/en/index.ts`, `ar/index.ts` | its strings composed at their key, its create label spread into `common.actions` from its own piece, and `common.refusals.host.<kind>NeedsViewing`; `pnpm i18n` regenerates `i18n-types.ts` |
| `src/lib/permission/i18n/en.ts`, `ar.ts` | the sentence refusing each of its four flags |
| `src/lib/organization/i18n/en.ts`, `ar.ts` | its family's name in the role editor, and its word on a role's card |

**What follows from the declaration or the list, and is edited nowhere else:**

| What | Read from |
| --- | --- |
| its glyph in the role editor's groups | its surface's `record.glyph`, which `app/surfaces.ts` provides and `glyphOf` in `feature/surface.ts` reads; a kind with no glyph fails the type check there |
| its refusal of a write without its view | the family on each side: Rust's `RefusalReason::NeedsViewing(kind)` crosses as `<kind>NeedsViewing`, and `TAURI_REFUSAL_REASONS` spells the same word from `RECORD_KINDS` |
| its home's layer | `layers.test.ts`, which makes a feature of every home whose declaration `app/features.ts` or `app/surfaces.ts` imports |
| the root router's test | `app/tests/router.test.ts`, which builds the hand-written root from the list |

Tests that pin today's kinds by what they specify change with it as well, and are not counted
above, since each states what a kind is allowed or shown rather than listing the kinds: the
procedure-to-flag table and the view flags in `api/tests/flags.test.ts`, the flag tables in
`permission/tests/`, the role and member tests under `organization/`, whose groups and lines name
each kind, `shell/tests/` for the rail and the places, `transfer/tests/`, whose masks name each
kind's flags, and in the crate `permission.rs`'s own tests and the signed fixtures in
`organization/authority/preimage.rs` and `upgrade/format/chain/plan.rs`, which hold the member
role's mask. The schema's migration comes with its seed in `organization/lease/apply.rs`'s
`SEEDS`, as every workspace migration does, kind or not.

**A feature with no kind** is its directory, its lines in `app/features.ts` and, where it draws
anything, `app/surfaces.ts`, its codes and their fields in `app/refusal.ts` where it refuses, its strings composed
in `i18n/{en,ar}/index.ts`, its home's layer in `layers.test.ts`, and its routes if it has pages. **A Rust feature** is its directory with a
`plugin.rs`, its `pub mod` and `.plugin(<feature>::plugin())` in `lib.rs`, and `"<plugin>:default"`
in `capabilities/default.json`; `build.rs` reads each `plugin.rs` for the commands the ACL allows,
so no command is listed anywhere else. Removing either is the reverse.

## A Rust directory is rooted by `mod.rs`

A module with children is a `<concept>/` directory whose root is `mod.rs` — `sync/mod.rs`,
`turso/oauth/mod.rs`, `database/mod.rs`. Never `<concept>.rs` beside `<concept>/`.

The crate is on edition 2024, where both spellings compile, so this is a choice rather than a
constraint. It is made this way because the alternative writes the concept's name twice and
then makes the two drift: the file and the directory are one module, and a reader who opens
`sync.rs` has to know that half of it is somewhere else. One directory, one root, and the
name appears once — on the directory that holds everything the module is.

## A Rust name is one word

Files and directories under `tauri/src/` are named with a single word; where a qualifier is
needed, a directory carries it. `sync/test/server.rs`, not `sync/test_server.rs`.

This is the same rule as the table above, applied to the shape Rust makes easy: an
underscore is available in a filename, so a module that grows a second concern grows a
second word instead of a directory, and the tree stops describing itself.

## The tree conforms; keep it that way

Every row above now holds throughout `src/lib/` and `tauri/src/` (#126). The standing
counter-example used to be `src/lib/api/mod.ts`; there is no `mod.ts`, no `utils/`, no
`common/`, and no plural module directory left. `src/routes/` is the acknowledged
exception, and its segments are URL path names rather than module names.

Where a divergence turns up anyway, `CLAUDE.md`'s rule on architectural boundaries governs
what happens to it. What that means specifically for naming: **a rename the change is not
about waits for its own ticket**, however small it looks from here.

## Prototype code

### Throwaway prototype code goes in `src/lib/prototype/`

Beside `switcher.svelte`, the repository's own prototype machinery, driven by
`pnpm prototype`. Leave it untracked, and delete it once its question is answered — the
write-up under the effort's `evidence/prototypes/` is what survives.

*Why: being untracked, it shows in `git status`, which is what stops it being committed
silently.*

### It cannot live under a gitignored protocol directory

Vite serves nothing from outside the project's source tree, so importing a component from
`.aep/position/` — or anywhere else outside `src/` — fails at transform time:

```
Failed to load url .../position/prototypes/<name>.svelte ... Does the file exist?
```

*Why: the file exists and the error still says it does not, so the failure reads as a
missing file rather than as a path that was never servable.*

Established 2026-08-12 against Vite 8.2.0 / SvelteKit 2 / Svelte 5, when a prototype
written to the protocol directory could not be imported from a route.
