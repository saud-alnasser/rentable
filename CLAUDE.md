# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`rentable` is an offline-first desktop rents payment tracker: a Tauri 2 (Rust) shell wrapping a SvelteKit 2 / Svelte 5 frontend, with a local SQLite database and optional Google Drive backup/sync. There is no server — everything runs in the desktop app.

## Commands

```bash
pnpm dev                # vite dev server only (port 1420, strict) — no Tauri window
pnpm tauri dev          # full desktop app (loads .env first via scripts/tauri-with-env.mjs)
pnpm tauri build        # production bundle; this is what CI builds
pnpm check              # svelte-kit sync + svelte-check + prettier --check  (CI gate)
pnpm lint               # prettier --check + eslint
pnpm format             # prettier --write

pnpm db:generate        # drizzle-kit generate → writes SQL into tauri/migrations/
pnpm db:migrate         # apply migrations to DATABASE_URL (dev convenience)
pnpm db:studio
pnpm db:seed            # tsx scripts/seed.ts (faker data)
pnpm db:purge           # tsx scripts/purge.ts

pnpm i18n               # typesafe-i18n watcher; regenerates src/lib/i18n/i18n-types.ts
```

Always use `pnpm` (engine-strict, pnpm 10+, Node 24).

### Tests

There is no test script. Tests are `*.test.mjs` files colocated with the code, using `node:test` + `node:assert/strict`, importing the `.ts` source directly (Node 24 type stripping):

```bash
node --test src/lib/api/utils/dashboard.test.mjs        # single file
node --test "src/**/*.test.mjs"                         # all
```

Only pure logic in `src/lib/api/utils/` is covered this way.

## Architecture

### The data path

The app has a server-shaped API with no server. Requests flow:

```
Svelte component
  → resource hook (TanStack Query)      src/lib/resources/<domain>/hooks/queries.ts
  → tRPC caller `api`                   src/lib/api/mod.ts
  → router procedure                    src/lib/api/routers/*.ts
  → Drizzle (sqlite-proxy)              src/lib/api/database/mod.ts
  → invoke('db_execute_single_sql')     tauri/src/database/
  → SQLite
```

Key consequences:

- `src/lib/api/mod.ts` builds a **direct tRPC caller** (`allowOutsideOfServer: true`), not an HTTP client. Router procedures execute in the webview, in-process. Import it as `api` and call `api.contract.getMany({})` directly — there is no fetch, no serialization boundary except the Tauri `invoke` for raw SQL.
- Drizzle uses the **sqlite-proxy driver**; every query is marshalled to Rust as `{ sql, params, method }`. Batch queries go through `db_execute_batch_sql`. Note `db.transaction()` is not available in the proxy driver — multi-step writes are sequenced in the router.
- Everything is client-side: `ssr = false` everywhere, `prerender = true` only for `+layout.ts`; each `+page.ts` sets `prerender = false`. Built with `adapter-static` and an `index.html` fallback.

### Layers

- **`src/lib/api/`** — the "backend". `trpc.ts` defines the context (`{ db }`), the `public` procedure (with a logging middleware), and the `autosync()` middleware that schedules a Google Drive push after a successful mutation — add it to any procedure that writes. `routers/` holds one router per domain (`app`, `tenant`, `complex`, `contract`). `utils/` holds pure, testable business logic.
- **`src/lib/api/database/schema.ts`** — single source of truth: Drizzle table + a matching Zod schema + inferred type per entity (`tenant`/`TenantSchema`/`Tenant`). Routers derive input schemas from these (`ContractSchema.omit({ id: true, status: true })`). Change both the table and the Zod schema together, then run `pnpm db:generate`.
- **`src/lib/api/tauri.ts`** — the typed facade over every Rust command (`window`, `settings`, `backup`, `update`, `remoteSync.googleDrive`). All `invoke` calls belong here, except the two hot database commands.
- **`src/lib/resources/<domain>/`** — feature code: `components/` (domain UI) and `hooks/queries.ts` (TanStack Query wrappers). Each `queries.ts` exports a `keys` object; mutations invalidate through those keys. Toast behaviour goes through `onMutationSuccess`/`onMutationError` in `src/lib/common/utils/queries.ts`, which special-cases `TRPCError` `BAD_REQUEST` as a user-facing message.
- **`src/lib/common/components/fragments/`** — shadcn-svelte primitives (`components.json` maps `ui` here). Don't hand-edit; regenerate via the CLI. `blocks/` holds app-level composites (data-table, navbar, window controls).
- **`tauri/src/`** — Rust: `bootstrap.rs` (startup + recovery), `database/` (sqlx pool, proxy commands, custom migration runner over `tauri/migrations/*.sql` tracked in a `__migrations__` table), `backup.rs`, `remote_sync.rs`, `update.rs`, `window.rs` (custom decorations — the window is `decorations: false`).

### Derived status

Contract and unit statuses are **derived, not stored authoritatively**: `utils/contract-status.ts` computes them from dates and payments, and `utils/sync.ts` writes the derived values back after any mutation that touches contracts, payments, or unit assignments. When adding such a mutation, run the sync step or statuses go stale.

### i18n

`typesafe-i18n` with `en` and `ar` (RTL) locales in `src/lib/i18n/<locale>/index.ts`. `i18n-types.ts` and the `i18n-util*.ts` files are **generated** — edit the locale files and run `pnpm i18n`. Components read translations from the `LL` store (`$lib/i18n/i18n-svelte`).

## Conventions

- Svelte 5 runes throughout (`$state`, `$derived`, `$props`); TanStack Query v6 hooks take a thunk: `createQuery(() => ({ ... }))`.
- Tailwind v4 (CSS-first config in `src/app.css`), `tailwind-variants` + `tailwind-merge` via `$lib/common/utils/tailwind`.
- Validation errors surface as `TRPCError` with code `BAD_REQUEST`; Zod failures are flattened into `data.zodError` by the tRPC error formatter.
- Commit/PR titles must be conventional commits — CI lints PR titles.
- Releases are driven by changesets (`pnpm changeset`); `.github/workflows/release.yml` versions, tags, and builds signed Tauri updater artifacts on `main`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `saud-alnasser/rentable`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map onto this repo's existing emoji label vocabulary; `ready-for-agent` and `ready-for-human` share one label. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Environment

Copy `.env.example` to `.env`. `DATABASE_URL` is only used by drizzle-kit and the seed/purge scripts — the running app resolves its own database path from Tauri settings. `TAURI_UPDATER_PUBLIC_KEY` and the Google OAuth values are read at build time by `pnpm tauri` (which loads `.env` before delegating); signing keys are CI-only secrets.
