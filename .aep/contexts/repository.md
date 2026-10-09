---
use-when: "a term, boundary, or constraint about this repository is in question, before reaching for a narrower context"
---

# Context — rentable

An offline-first desktop tracker for rents payments — one bilingual application, one workspace,
held locally as a replica of a database the service keeps. Every layer, including the one shaped
like a backend, runs inside the desktop app. A Tauri 2 (Rust) shell around a SvelteKit 2 /
Svelte 5 frontend.

*It read "one local SQLite database, one optional Google Drive backup" until 2026-08-19. Drive
sync retired (#554) and the record of truth moved.*

## Where the application is

**The repository is a pnpm workspace, and the desktop application is the package
`apps/desktop/`.** The root holds only what governs every package — the lockfile,
`.changeset/`, the linting and formatting configuration, `turbo.json`, and `.aep/`.

**There is one application, and four packages beside it.** `packages/workspace-migrations` is
the SQL a workspace database is built from, `packages/workspace-permission` names what a member
may do, `packages/design` is the design system, and `packages/testing` is the test scaffolding the
application and the design package share (effort 840, ticket 42). *`apps/control-plane/`
stood beside the desktop from 2026-08-18 (#549) to 2026-09-12: the always-online tier holding
accounts, workspaces and membership, deployed nowhere. It retired with
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], requirement 19, when an
organization on the customer's own Turso account took over everything it answered for, and its
two Turso modules became a fourth package, `packages/turso-platform`.* *That package was removed
with effort 840 (requirement 16, 2026-09-28) because nothing in the desktop imported it:
replication and the Platform API run in the Rust crate, `tauri/src/turso/`, against the
owner's own Turso account.* Everything below in this file describes the desktop application.

**Every `src/…` and `tauri/…` path in the rest of this file, and in the rules and contexts
beside it, is relative to `apps/desktop/`** unless it is written out in full. That is the one
translation to hold; it is stated here rather than repeated in forty artifacts, because a path
repeated forty times is a path that drifts in thirty-nine of them. Where a path is *typed* —
a cargo manifest, a config the tool resolves from the working directory — the reference that
carries the command writes it out from the root instead, because that one has to be correct as
entered rather than as understood.

Which tool runs which script, and why `check` and `lint` sit outside the task graph, is
[[references/pnpm]].

## Vocabulary

**Workspace**:
The unit of syncable state — a database of record on the organization's Turso account, with a
local replica meant to serve every read and take every write. An organization holds one or more,
a member reaches the ones their grants name, and a machine holds one open at a time. *It read
"exactly one per installation" until the organization effort landed on 2026-09-12.*
_Avoid_: treating the replica as the workspace. The file on this machine is a copy of the
record, never the record

*It read "one local database plus its metadata, mapped to one remote location" until 2026-08-20
(#573). One record of truth left the mapping nothing to be optional about: a workspace does not
acquire a remote, it is one. **The path was built later the same day** (#616): the startup path
mints a credential and opens `Engine::Workspace`, so a signed-in machine reads its replica. A
machine that has signed in on no account opens the plain file `connect()` makes, and nothing a user
sees is behind it.*

**Snapshot**:
A point-in-time copy of a database. **The application takes one before it changes a database's
shape, and at no other time** (effort 838, requirement 13, `tauri/src/backup.rs`): before an
organization's format changes and before a workspace migration, a logical copy of every table,
index, view and trigger is written to `<data dir>/backups/<database>/`, the three newest kept, and
where the machine holds the owner's Turso account a protected copy named `copy-...` is made there,
which only the owner removes. Nothing in the application restores one; that is by hand or on the
account, where Turso's own point-in-time restore also stands. *It said the application kept none
since #569 until effort 838; the file copy #569 retired stays retired, since the engine refuses to
copy a replica's file, and the copy is read out row by row instead.*
_Avoid_: using it for the local replica, which is a live copy rather than a point in time

**Reconcile**:
Recompute derived state from its source of truth and write the result back, and link the
renewals it recognises, the one fact it writes that is not derived. Always local.
_Avoid_: sync

**Sync**:
Exchange workspace state with the remote. Always remote.
_Avoid_: using it for any local recomputation

**Derived status**:
A status computed from other rows rather than authored by a user. It is stored, but the
stored value is a cache of the derivation and never the authority.

**Undo**:
Reversing the user's own last data change by issuing its inverse. Scoped to the session and
to what the user did — never to what a sync, a migration, or a recovery did.
_Avoid_: rollback, restore — those belong to Turso's point-in-time restore, which is nobody's
call here

**Inverse**:
The call that returns a workspace to the state before a given mutation, issued through the
same procedure any other caller would use. A mutation's inverse is part of that mutation, not
a mechanism underneath it ([[rules/data]], under *Undo*).

## Boundaries

- **The application never makes an HTTP call to fetch a record.** *Superseded 2026-08-18 and
  rewritten 2026-08-20; it read "There is no server", and
  [[efforts/a-workspace-follows-its-user/spec]], decision 09, is where that was decided.* **There
  is a server, it holds the record, and it is still not in the data path.** The API layer is a
  direct caller executing in the webview, and that part is unchanged: a read or a write reaches a
  local file over Tauri's IPC into Rust, never over HTTP. The replica syncs on its own, and the
  one service it reaches is the customer's own Turso account. No transport in the tree
  reads over the wire from the webview; [[rules/api-layer]], under *One database client type*,
  counts the callers that build a client.

  The property the old boundary was protecting therefore survives the premise that stated it, which
  is why this is superseded in place rather than footnoted: a reader who takes "never HTTP" at
  face value builds against a sentence rather than a rule.

  *The 2026-08-18 wording split this across two kinds of workspace — "a local workspace has no
  server at all" against "a hosted workspace has a remote of record". One record of truth left
  only the second half, and a boundary that still offers the reader a choice of two is one they
  can satisfy by picking the easier.*
- **Credentials never cross the IPC boundary.** Every network call that spends one is Rust's:
  the Turso consent, the Platform API, and the replicas' own sync. No command hands the web layer
  a token, a key or a password back. The surface is coarse operations the web layer observes
  rather than sequences: signing in, joining, inviting, opening a workspace. What binds a change
  is [[rules/credentials]], under *Client boundary*.

  *It read "Google Drive HTTP and OAuth" over six operations — link, cancel a link, unlink, sync,
  inspect, resolve a conflict — until Drive sync retired (#554, 2026-08-19), and "Google's OAuth
  and profile read, and the control plane's" until both retired (2026-09-12).*
- **Diagnostics are written locally, bounded, and stripped of recognised credentials.**
  Nothing collects diagnostics anywhere, and there is no service of ours to send them to, so
  events go to a rotating file the user can open from settings. Redaction
  happens in the sink, on the way to disk — never at the call site. It works by **recognising**
  the credential shapes this application handles, so it bounds the damage rather than
  guaranteeing none: a value known to be secret still must not be put in an event.

  *"not even for a hosted workspace, whose control-plane API is…" until 2026-08-20 (#573). The
  qualifier picked one of two kinds of workspace and there is one.*
- **Domain rules live in their concept's own module.** Routers validate, call the domain,
  persist, and reconcile — they hold no rules. There is no repository layer; routers reach
  the database directly (#107, #108).
- **Modules are organised by concept, not by layer.** A concept owns its rules, its queries, its
  strings and its components together, under one singular directory named for it, and is entered
  through its `index.ts` (what loads under Node) and its `ui.ts` (what only the window loads).
  [[rules/module-layout]] states that shape, the layer rule, where a concept departs from them, and
  what adding a feature touches. The homes of `src/lib/`, in their four layers (effort 840), as
  `lib/tests/layers.test.ts` places them; imports point down, or sideways through an entry, never
  up and never in a cycle:

  | Layer | Home | What it holds |
  | --- | --- | --- |
  | 4 composition | `app/` | the composition root, the one place that names every feature: `features.ts` and `surfaces.ts` list the declarations, and `router.ts`, `host.ts`, `caller.ts`, `cache.ts`, `transfer.ts`, `contributions.ts` and `refusal.ts` build from them what the shell and the capabilities are handed |
  | | `shell/` | the window around the pages: the frame, the rail, the breadcrumb, the window controls, the error boundaries and the shortcut sheet, drawn from the surfaces and their `slots`; it names no feature. It was `layout/` until effort 840 |
  | | `prototype/` | the repository's prototype machinery, `switcher.svelte`, driven by `pnpm prototype` (`apps/desktop/scripts/prototype.mjs`), where throwaway prototype code is written ([[rules/module-layout]], under *Prototype code*) |
  | | `src/routes/` | the pages, layer-first as SvelteKit requires; a route composes and holds no wiring, importing only a home's components, a home's `ui.ts` and `app/` |
  | 3 features | `tenant/`, `complex/` (with `unit/`, a kind of its own, inside it), `contract/`, `payment/`, `dashboard/` | the record features and the landing screen. A unit is reached only through the complex holding it |
  | | `workspace/`, `organization/`, `settings/`, `sync/`, `update/`, `startup/` | the workspace, the organization with its sub-concepts `member/`, `role/`, `access/`, `workspace/`, `setup/` and `session/`, the settings area, replication, the updater, and the startup lifecycle with its screens |
  | 2 capabilities | `permission/`, `mutation/`, `undo/`, `history/`, `shortcut/`, `notification/`, `palette/`, `create/`, `act/`, `list/`, `form/`, `transfer/`, `print/`, `date/` | the mechanisms every feature shares, each one directory with its own API; a capability imports no feature, and one that needs what features declare is handed it by `app/` |
  | 1 foundation | `feature/` | the contract a feature declares against: `defineFeature`, `defineSurface`, sections, slots and contributions |
  | | `design/` | presentation only: the cells and the language choice, what is left once the design system became `@rentable/design` |
  | | `platform/` | what crosses a process boundary and is no feature's: the window, the opener, the dialogs, diagnostics, locale, appearance and the database transport and schema |
  | | `api/` | the in-webview caller, the request context, the tRPC wiring and the refusal plumbing |
  | | `i18n/` | the generated runtime, and each locale's `index.ts` composing every concept's strings at their key; its path is the generator's |
  | | `error/` | decoding the failures that cross the IPC boundary into what a reader is shown |

  A feature or capability that crosses to Rust declares its own port and adapter (`host.ts`,
  `tauri.ts`), and `app/host.ts` composes them with the platform's part into the host the caller
  is bound with. Every feature's router mounts at the root under its name and none mounts
  another's, so a procedure's path is its feature and then the procedure: `payment.get`,
  `sync.getState`, `startup.bootstrap`. Features never render each other's components: a page draws
  the sections contributed to it, the shell draws the slots contributed to its places, and where a
  depended-on feature needs something of the one depending on it (the contracts that refuse a
  tenant's deletion, the payments a contract's settlement reads), that feature declares it under
  `contributes`, which `app/contributions.ts` names and `feature/feature.ts` explains.

  **The Rust crate, `tauri/src/`, is a set of inline Tauri plugins** that `lib.rs` composes, one
  line each, and nothing else: `diagnostics/`, `window/`, `settings/`, `database/`, `sync/`,
  `update/`, `print/`, `transfer/`, `startup/`, `upgrade/` (everything that brings a 0.12 to 0.15
  install forward) and `organization/` (one subdirectory per sub-concept, with `act.rs` running the
  signed-in check, the pull and the machine lock once). Beside them, holding no commands: the ports
  `clock/` and `credential/`, `turso/` (the Turso adapter), `machine/` (this machine's record),
  `schema/`, `backup.rs`, `error.rs`, `http.rs`, `persisted.rs`, the shared test scaffolding in
  `test/`, and `guard/`, the tests holding the crate to its module graph, its names and its ACL.

  *This bullet grew by accretion through effort 840 and was rewritten against the finished tree on
  2026-09-29 (ticket 58). It read "three homes own no concept", `design`, `platform` and `api`, and
  counted `design` at 80 files; the record acts, the list, the create control, transfer, mutation
  and undo that `design` held are capabilities now, and it holds 30.*
- **Reconciliation owns the derived columns** — contract status, the contract payment
  aggregates, and unit status. Any mutation touching contracts, payments, or unit
  assignments must reconcile, or the stored values go stale. A mutation may seed the
  derived columns of the row it writes, so the row it returns is current without a
  re-read; reconcile recomputes them regardless, from the same domain functions. The
  whole-table pass also writes one fact that is not derived: the renewal link, where it
  recognises a renewal the application did not record ([[contexts/desktop/contract]],
  *Renewal link*). Once written the link is the contract's, and no reconcile pass moves it; only
  the heal moves it, to the contract that stayed when copies merge.

## Constraints

- **The application has users.** *Stated by the human on 2026-10-05.* Real organizations, their
  members and their records live on people's machines and on owners' own Turso accounts, so
  anything that changes data at rest, a replicated schema, an organization's format, the vault,
  the keyring, or a machine's own record carries what is already there across to the new shape
  ([[rules/migrations]]). **Resetting an organization, asking a person to set up again, or
  dropping a replica is not a way to land a change.** *Until this date it was still being done
  in development, as on 2026-09-16 when an organization made by an earlier build was reset
  rather than migrated.* A change to the way in is held to the same bar: a build that strands a
  person at the wall, or forgets an organization they held, is a lost customer and not a
  restart.
- **Offline-first, from the second run onwards.** *Superseded 2026-08-20 (#573); it read "The
  application is fully usable with no network. Remote sync is optional and additive, never a
  dependency of ordinary use."* Both halves of that stopped being true when the record of truth
  moved: replication is how the workspace exists rather than an addition to it, and **the
  sign-in wall is built** — `sync/admission.ts` refuses a workspace to a machine with no
  organization or with a locked vault, and `startup/component/root.svelte`, which the root layout draws, raises it before anything renders.

  **A first run needs a network and an account, and every launch after it needs neither.** The
  first run grants the application authority over the owner's Turso account in the browser and
  creates the organization there; a member's first launch opens an invitation link against the
  same account. From then on a password opens the vault on this machine, with or without a
  network, and the wall admits on that. *It read "what is not built is the half that would make
  a first run need a network" while no control plane was deployed; the organization effort built
  that half on the customer's own account instead (2026-09-12).* *Corrected 2026-09-14
  ([[efforts/826-the-organization-and-the-way-in-are-rethought/spec]]): a member's first launch
  opens an invitation link and types the code whoever invited them read out, and chooses a
  password there; from the second launch on the remembered key opens the vault with no password
  until the member signs out. One Turso group holds one organization, and a first run into a
  group that already holds one is refused before anything is created.*

  What survives either way, and is the part worth holding, is everything after the first run:
  every read and every write is served locally with no network at all, for as long as the
  credential the vault unsealed lives, which is four weeks from its mint and renewed by the
  owner's machine. *Requirement 15 of [[efforts/a-workspace-follows-its-user/spec]] closed a
  control plane's window at three days; requirement 18 of the organization effort is where the
  boundary is argued now.*
- **Arabic and English, RTL and LTR.** Both locales are first-class; a layout that only
  works in one direction is broken.
- **Light and dark.** Both appearances are first-class: the application follows the system live
  unless the reader chose one in general settings, and a surface that reads in only one of them
  is broken. `[[rules/frontend]]`, under *Styling*, says how the token layer carries both.
- **Saudi identity documents.** A tenant is identified by a government document whose two
  accepted forms are fixed by Saudi issuance, not by this application.

## Areas with their own context

| Area | Context |
| --- | --- |
| contracts, payments, unit assignments, derived status | [[contexts/desktop/contract]] |
| declaring, composing, adding or removing a feature or a capability, on both sides of the IPC boundary | [[contexts/desktop/feature]] |
| schema, migrations, how queries reach SQLite | [[contexts/desktop/persistence]] |
| complexes and units | [[contexts/desktop/property]] |
| an organization, its members, their vaults, and the account it lives on | [[contexts/desktop/organization]] |
| the replica a workspace is held as, and the credential it replicates under | [[contexts/desktop/remote-sync]] |
| tenants, identity, phone numbers | [[contexts/desktop/tenant]] |
