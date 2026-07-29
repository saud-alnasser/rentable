# pnpm

The package manager and the entry point for every script in this repository. `engine-strict`
is on and the engines are pinned — **pnpm 10+ on Node 24**. npm and yarn will refuse or
produce a lockfile CI rejects.

Docs: <https://pnpm.io/cli/add>. Fetch when a command needs a flag not listed here —
workspace filtering, overrides, or anything touching the lockfile.

## Install dependencies

```bash
pnpm install
pnpm install --frozen-lockfile   # what CI runs; fails instead of updating the lockfile
```

Native modules are gated: only the dependencies listed under `onlyBuiltDependencies` are
allowed to run build scripts. Adding a dependency that needs one means adding it to that
list too, or it silently installs unbuilt.

**That list lives in `pnpm-workspace.yaml`, not in `package.json`.** pnpm 10 stopped reading
the `pnpm` field in the manifest and moved every setting under it into the workspace file,
warning about the ignored keys on *every* invocation. This repository carried the superseded
field until it was removed; if a `pnpm` field reappears in `package.json`, that warning is
back and the settings in it are doing nothing.

## Run the app

```bash
pnpm dev          # vite only, port 1420 (strict) — no desktop window
pnpm tauri dev    # the actual desktop app; see tauri.md
```

`pnpm dev` gives you the frontend with no Rust side, so anything touching the database or a
Tauri command will fail. It is for UI work only.

## Check, lint, format

```bash
pnpm check    # svelte-kit sync + svelte-check + prettier --check   ← the CI gate
pnpm lint     # prettier --check + eslint
pnpm format   # prettier --write
```

`pnpm check` includes the prettier check, so CI runs `pnpm exec eslint .` afterwards rather
than `pnpm lint`, to avoid checking formatting twice.

## Regenerate i18n types

```bash
pnpm i18n
```

A **watcher**, not a one-shot — it does not exit. The type definitions and utility files
under `src/lib/i18n/` are its output; edit the locale files and let it regenerate.
