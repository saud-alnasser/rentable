---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: context
use-when: "a term, boundary, or constraint about this repository is in question, before reaching for a narrower context"
---

# Context — rentable

An offline-first desktop tracker for rents payments — one bilingual application, one local
SQLite database, one optional Google Drive backup. There is no server: every layer,
including the one shaped like a backend, runs inside the desktop app. A Tauri 2 (Rust)
shell around a SvelteKit 2 / Svelte 5 frontend.

## Vocabulary

**Workspace**:
The unit of syncable state — one local database plus its metadata, mapped to one remote
location.

**Snapshot**:
A point-in-time copy of a workspace database, held as a file. Local backups and remote
copies are both snapshots.

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
_Avoid_: rollback, restore — those belong to the protected update backup and to snapshots

**Inverse**:
The call that returns a workspace to the state before a given mutation, issued through the
same procedure any other caller would use. A mutation's inverse is part of that mutation, not
a mechanism underneath it ([[rules/undo]]).

## Boundaries

- **There is no server.** The API layer is a direct caller executing in the webview. The
  only process boundary it crosses is Tauri's IPC into Rust — never HTTP.
- **Credentials never cross the IPC boundary.** Google Drive HTTP and OAuth belong in Rust,
  and there is no longer a second place they could be: no Drive network code remains in
  TypeScript, and no command hands the web layer the client secret or a refresh token. The
  surface is six coarse operations — link, cancel a link, unlink, sync, inspect, resolve a
  conflict — and the web layer observes them rather than sequencing anything behind them.
  What binds a change is [[rules/drive-client-boundary]].
- **Diagnostics are written locally, bounded, and stripped of recognised credentials.**
  There is no server to report to, so events go to a rotating file the user can open from
  settings. Redaction happens in the sink, on the way to disk — never at the call site. It
  works by **recognising** the credential shapes this application handles, so it bounds the
  damage rather than guaranteeing none: a value known to be secret still must not be put in
  an event.
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
  `switcher.svelte`, driven by `pnpm prototype` (`scripts/prototype.mjs`). It is where
  throwaway prototype code is written; [[rules/prototyping]] is what binds a change.
- **Reconciliation owns the derived columns** — contract status, the contract payment
  aggregates, and unit status. Any mutation touching contracts, payments, or unit
  assignments must reconcile, or the stored values go stale. A mutation may seed the
  derived columns of the row it writes, so the row it returns is current without a
  re-read; reconcile recomputes them regardless, from the same domain functions.

## Constraints

- **Offline-first.** The application is fully usable with no network. Remote sync is
  optional and additive, never a dependency of ordinary use.
- **Arabic and English, RTL and LTR.** Both locales are first-class; a layout that only
  works in one direction is broken.
- **Saudi identity documents.** A tenant is identified by a government document whose two
  accepted forms are fixed by Saudi issuance, not by this application.

## Areas with their own context

| Area | Context |
| --- | --- |
| contracts, payments, unit assignments, derived status | [[contexts/contract]] |
| schema, migrations, how queries reach SQLite | [[contexts/persistence]] |
| complexes and units | [[contexts/property]] |
| backup, Google Drive, linking, conflicts | [[contexts/remote-sync]] |
| tenants, identity, phone numbers | [[contexts/tenant]] |
