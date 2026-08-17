---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: reference
use-when: "building, running, or configuring the desktop shell"
---

# Tauri CLI

Builds and runs the desktop app. **`pnpm tauri` is not the Tauri CLI directly** — it is a
wrapper (`apps/desktop/scripts/tauri-with-env.mjs`) that loads `apps/desktop/.env` and then
delegates. Environment already set in the shell wins; the file does not override it.

The wrapper anchors both the `.env` read and the child's working directory to its own package,
rather than inheriting whatever directory it was called from. That matters because the Tauri CLI
finds its `tauri.conf.json` by walking up from the working directory — **`--config` cannot pin
that**, since it merges over the discovered file rather than replacing the discovery. From the
root, `pnpm tauri <args>` delegates with `pnpm --filter ./apps/desktop` and forwards the
arguments unchanged, so every invocation below reads the same typed from either place.

Docs: <https://tauri.app/reference/cli/>. Fetch for bundle targets, signing options, or any
subcommand beyond the two below.

## Run the desktop app

```bash
pnpm tauri dev
```

The full app — Rust side, webview, database. Use this rather than `pnpm dev` for anything
that touches data.

## Open the app on one route

```bash
pnpm prototype /contracts?create
```

`apps/desktop/scripts/prototype.mjs`, for looking at a prototype: same app, window opened on the route
given instead of `/`. The route survives the reloads the Rust watcher triggers, which is the
whole point — clicking back to the surface under test after every restart is most of the
friction of running a prototype.

It reaches the window through `tauri dev --config`, which takes **JSON strings or paths to
JSON, JSON5 or TOML files to merge with the default configuration file** — a merge, not a
replacement, so only `build.devUrl` is overridden and `tauri.conf.json` is never edited. The
script writes the override to a temporary file and removes it afterwards; a run that is
killed leaves nothing behind in the repository.

The bar for switching between a prototype's variants is
`apps/desktop/src/lib/prototype/switcher.svelte`,
and it renders under `dev` only.

## Build a release bundle

```bash
pnpm tauri build
```

Slow: it compiles the Rust side in release mode and then packages every bundle target.

**CI does not run this on a pull request.** The gate there compiles the binary and stops —
`cargo build --release` — so bundling is exercised only by the release workflow, on `main`.
Reach for this locally when the question is about packaging; for "does it compile", the
cargo commands in `cargo.md` are minutes faster.

## Why the wrapper exists

`TAURI_UPDATER_PUBLIC_KEY` and the Google OAuth values are read **at build time** from
`.env`. Calling `tauri` directly, without the wrapper, produces a binary built with those
values missing — it compiles and it runs, and updates and Drive linking are quietly broken.

Signing keys are CI-only secrets and are never in `.env`. Start from `apps/desktop/.env.example`.
