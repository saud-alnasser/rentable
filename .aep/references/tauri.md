---
aep: 2.7.0
owner: repository
date: 2026-08-20
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
pnpm dev              # the control plane and the desktop app together
pnpm dev:desktop      # the desktop app alone
pnpm tauri dev        # the same thing, unaliased
```

The full app — Rust side, webview, database. `pnpm dev:desktop` is `pnpm tauri dev` under
another name, and the root's `dev` runs it alongside the control plane, which the application
now needs: since the sign-in wall (#571) there is no route into a workspace that does not go
through a control plane, so the desktop alone is a sign-in screen that cannot be got past.

**`pnpm dev:web` is the vite-only script**, which is what plain `pnpm dev` used to be — renamed
2026-08-20 so that `dev` could mean the application. Inside `apps/desktop` it is the package's
own `dev:web`, and `tauri.conf.json`'s `beforeDevCommand` names it: `tauri dev` runs vite
itself, so pointing `beforeDevCommand` at a `dev` that runs `tauri dev` is an infinite
recursion.

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
pnpm build             # both applications: this, and the control plane's tsc
pnpm build:desktop     # the desktop bundle alone
pnpm tauri build       # the same thing, unaliased
```

Slow: it compiles the Rust side in release mode and then packages every bundle target.
`pnpm build:desktop` is `pnpm tauri build` under another name, renamed 2026-08-20 by #627 so
that `build` means the installers rather than the frontend bundle.

**`pnpm build:web` is the frontend bundle**, which is what plain `pnpm build` used to be, and
`tauri.conf.json`'s `beforeBuildCommand` names it. Pointing that at a `build` that runs
`tauri build` recurses, exactly as `beforeDevCommand` does.

**CI does not run the bundle on a pull request.** The gate there runs `pnpm build:web`, compiles
the binary with `cargo build --release`, and stops — so bundling is exercised only by the release
workflow, on `main`.
Reach for this locally when the question is about packaging; for "does it compile", the
cargo commands in `cargo.md` are minutes faster.

## Why the wrapper exists

`TAURI_UPDATER_PUBLIC_KEY` and the Google OAuth values are read **at build time** from
`.env`. Calling `tauri` directly, without the wrapper, produces a binary built with those
values missing — it compiles and it runs, and updates and signing in are quietly broken. That is
why the desktop's `dev` and `build` both go through `scripts/tauri-with-env.mjs` rather than
through the CLI.

Signing keys are CI-only secrets and are never in `.env`. Start from `apps/desktop/.env.example`.
