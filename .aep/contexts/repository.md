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
may do, `packages/design` is the design system, and `packages/turso-platform` is Turso's
Platform API and the migration runner in TypeScript, imported by nothing. *`apps/control-plane/`
stood beside the desktop from 2026-08-18 (#549) to 2026-09-12: the always-online tier holding
accounts, workspaces and membership, deployed nowhere. It retired with
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], requirement 19, when an
organization on the customer's own Turso account took over everything it answered for, and its
two Turso modules became the fourth package.* Everything below in this file describes the
desktop application.

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
A point-in-time copy of a workspace database. **The application keeps none** since #569: the
copies that exist are Turso's, taken and restored by whoever administers the account.
_Avoid_: using it for the local replica, which is a live copy rather than a point in time

**Reconcile**:
Recompute derived state from its source of truth and write the result back. Always local.
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
  one service it reaches is the customer's own Turso account. `platform/database/hosted.ts` is the one
  transport in the tree that would read over the wire from the webview, and nothing imports it —
  [[rules/api-layer]], under *One database client type*, is where that is recorded.

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
- **Modules are organised by concept, not by layer.** A concept owns its rules, its
  queries, and its components together, under one singular directory named for it:
  `contract`, `payment`, `tenant`, `complex`, `dashboard`, `settings`, `sync`. A unit is
  reached only through the complex holding it, so it lives inside that concept rather than
  beside it. Three homes own no concept, and a domain rule lives in none of them —
  **`design`**, what is left of the frontend machinery once the shareable half became a
  package — the four composites that reach past the design system, in `block/`: `list.svelte`,
  the `list-toolbar` and `search-field` every set draws above its records, and the
  `create-control` that is each set's one way to add to it (`record-actions` retired with effort
  832, when copy details became a record act); the record acts' shape and projections in
  `acts.ts`, the cells, the toast provider that configures the packaged `Toaster`, and the
  cross-concept helpers beside them: mutation handling, the workspace query-cache policy, undo,
  the shortcut registry and what builds the list's registrations, the list's motion
  (`list-motion`), the create key and what it answers (`create-key`, `create-target`,
  `create-intent`), where a create lands (`landing`), and the filter, date and import helpers.
  *It holds 80 files, counted on 2026-09-25. It held 459 until 2026-08-23 and 34 just after,
  and the count read 34 until 2026-09-25 while the home grew. The 425 that left are 387
  primitives, thirteen of the fifteen composites, fifteen root modules with the class merging and `csv.ts`
  among them, and the ten tests that moved with those; all of them are in `@rentable/design` now,
  whose last move landed at #784 ([[efforts/773-the-design-system-becomes-a-package/spec]]). This read
  "the frontend machinery every concept shares" until then, and what shares is exactly what
  left.*;
  **`platform`**, capabilities that cross a process boundary or are
  nondeterministic (the desktop shell, the database, diagnostics, locale); and **`api`**,
  the in-webview caller itself: the request context, the tRPC wiring, and the root router
  that assembles every concept's procedures. The clock is the one capability `platform`
  does not hold, because it is read nowhere but the context that supplies it. The
  application shell is neither primitive nor concept, so it is its own home, `layout`.
  `src/routes/` stays layer-first, as the framework requires. **The tree is this shape
  throughout** (#123–#126). Three directories sit outside it: `i18n`, whose path the locale
  generator fixes; `error`, which decodes failures crossing the IPC boundary and has
  not been placed; and `prototype`, the repository's own prototype machinery —
  `switcher.svelte`, driven by `pnpm prototype` (`apps/desktop/scripts/prototype.mjs`). It is where
  throwaway prototype code is written; [[rules/module-layout]], under *Prototype code*, is what binds a change.
- **Reconciliation owns the derived columns** — contract status, the contract payment
  aggregates, and unit status. Any mutation touching contracts, payments, or unit
  assignments must reconcile, or the stored values go stale. A mutation may seed the
  derived columns of the row it writes, so the row it returns is current without a
  re-read; reconcile recomputes them regardless, from the same domain functions.

## Constraints

- **Offline-first, from the second run onwards.** *Superseded 2026-08-20 (#573); it read "The
  application is fully usable with no network. Remote sync is optional and additive, never a
  dependency of ordinary use."* Both halves of that stopped being true when the record of truth
  moved: replication is how the workspace exists rather than an addition to it, and **the
  sign-in wall is built** — `sync/admission.ts` refuses a workspace to a machine with no
  organization or with a locked vault, and `+layout.svelte` raises it before anything renders.

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
| schema, migrations, how queries reach SQLite | [[contexts/desktop/persistence]] |
| complexes and units | [[contexts/desktop/property]] |
| an organization, its members, their vaults, and the account it lives on | [[contexts/desktop/organization]] |
| the replica a workspace is held as, and the credential it replicates under | [[contexts/desktop/remote-sync]] |
| tenants, identity, phone numbers | [[contexts/desktop/tenant]] |
