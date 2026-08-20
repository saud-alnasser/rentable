---
aep: 2.7.0
owner: repository
date: 2026-08-20
kind: context
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

**There is a second package, and it is not part of the application.** `apps/control-plane/`
is `@rentable/control-plane`, the always-online tier holding accounts, workspaces and
membership — built 2026-08-18 by #549 and **deployed nowhere**, though the desktop client now
reaches one where it is told of one (`tauri/src/sync/control.rs`). It has its own database and
its own schema, and **it holds no domain table**: it is in the credential path and never in the
data path. Everything below in this file describes the desktop application; where the control
plane differs, its own README says so.

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
The unit of syncable state, and there is exactly one per installation — a database of record in
Turso, with a local replica meant to serve every read and take every write.
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
  local file over Tauri's IPC into Rust, never over HTTP. The replica syncs on its own and the
  control-plane API is in the credential path only. `platform/database/hosted.ts` is the one
  transport in the tree that would read over the wire from the webview, and nothing imports it —
  [[rules/api-layer]], under *One database client type*, is where that is recorded.

  The property the old boundary was protecting therefore survives the premise that stated it, which
  is why this is superseded in place rather than footnoted: a reader who takes "never HTTP" at
  face value builds against a sentence rather than a rule.

  *The 2026-08-18 wording split this across two kinds of workspace — "a local workspace has no
  server at all" against "a hosted workspace has a remote of record". One record of truth left
  only the second half, and a boundary that still offers the reader a choice of two is one they
  can satisfy by picking the easier.*
- **Credentials never cross the IPC boundary.** Every network call that spends one is Rust's —
  Google's OAuth and profile read, and the control plane's — and no command hands the web layer a
  client secret, a refresh token or a session token. The surface is coarse operations the web
  layer observes rather than sequences: signing in, signing out, and reaching the control plane.
  What binds a change is [[rules/credentials]], under *Client boundary*.

  *It read "Google Drive HTTP and OAuth" over six operations — link, cancel a link, unlink, sync,
  inspect, resolve a conflict — until Drive sync retired (#554, 2026-08-19).*
- **Diagnostics are written locally, bounded, and stripped of recognised credentials.**
  Nothing collects diagnostics anywhere — the control-plane API is in the credential path and
  nothing else — so events go to a rotating file the user can open from settings. Redaction
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
  **`design`**, the design system and the frontend machinery every concept shares — the
  primitives, generated once and owned since, the composites built from them, and the
  cross-concept helpers beside them: class merging, mutation handling, the workspace
  query-cache policy; **`platform`**, capabilities that cross a process boundary or are
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
  account, and `+layout.svelte` raises it before anything renders.

  **What is not built is the half that would make a first run need a network.** Nothing creates
  a workspace at sign-up, no control plane is deployed, and `admission.ts` still admits a build
  that was never told of one. So a first run needs a network and an account **once a control
  plane is deployed**, and does not today. Written this way rather than as the end state,
  because a constraint that describes an unbuilt application is one a reader satisfies by
  imagining it.

  What survives either way, and is the part worth holding, is everything after the first run:
  every read and every write is served locally with no network at all, for as long as the
  session's refresh window is open. Requirement 15 of
  [[efforts/a-workspace-follows-its-user/spec]] closes that window at three days and is where
  the boundary is argued.
- **Arabic and English, RTL and LTR.** Both locales are first-class; a layout that only
  works in one direction is broken.
- **Saudi identity documents.** A tenant is identified by a government document whose two
  accepted forms are fixed by Saudi issuance, not by this application.

## Areas with their own context

| Area | Context |
| --- | --- |
| contracts, payments, unit assignments, derived status | [[contexts/desktop/contract]] |
| schema, migrations, how queries reach SQLite | [[contexts/desktop/persistence]] |
| complexes and units | [[contexts/desktop/property]] |
| signing in, the session a workspace replicates under | [[contexts/desktop/remote-sync]] |
| tenants, identity, phone numbers | [[contexts/desktop/tenant]] |
