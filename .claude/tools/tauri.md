# Tauri CLI

Builds and runs the desktop app. **`pnpm tauri` is not the Tauri CLI directly** — it is a
wrapper (`scripts/tauri-with-env.mjs`) that loads `.env` and then delegates. Environment
already set in the shell wins; the file does not override it.

Docs: <https://tauri.app/reference/cli/>. Fetch for bundle targets, signing options, or any
subcommand beyond the two below.

## Run the desktop app

```bash
pnpm tauri dev
```

The full app — Rust side, webview, database. Use this rather than `pnpm dev` for anything
that touches data.

## Build a release bundle

```bash
pnpm tauri build
```

What CI builds on every pull request. Slow, and it compiles the Rust side in release mode.

## Why the wrapper exists

`TAURI_UPDATER_PUBLIC_KEY` and the Google OAuth values are read **at build time** from
`.env`. Calling `tauri` directly, without the wrapper, produces a binary built with those
values missing — it compiles and it runs, and updates and Drive linking are quietly broken.

Signing keys are CI-only secrets and are never in `.env`. Start from `.env.example`.
