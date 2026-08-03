# pnpm

The package manager and the entry point for every script in this repository. `engine-strict`
is on and the engines are pinned — **pnpm 11+ on Node 24**. npm and yarn will refuse or
produce a lockfile CI rejects.

Docs: <https://pnpm.io/cli/add>. Fetch when a command needs a flag not listed here —
workspace filtering, overrides, or anything touching the lockfile.

## Install dependencies

```bash
pnpm install
pnpm install --frozen-lockfile   # what CI runs; fails instead of updating the lockfile
```

Native modules are gated: a dependency runs its build scripts only if `allowBuilds` maps its
name to `true`. Anything unlisted is treated as unreviewed, and pnpm **errors** rather than
warning — adding a dependency that needs a build means adding it to that map too.

**That map lives in `pnpm-workspace.yaml`, not in `package.json`.** pnpm 10 stopped reading
the `pnpm` field in the manifest and moved every setting under it into the workspace file,
warning about the ignored keys on *every* invocation. This repository carried the superseded
field until it was removed; if a `pnpm` field reappears in `package.json`, that warning is
back and the settings in it are doing nothing.

`allowBuilds` replaced the older `onlyBuiltDependencies` list in pnpm 11, along with
`neverBuiltDependencies`, `ignoredBuiltDependencies`, and `ignoreDepScripts` — a list of names
became a map of name to boolean, so a package can now be recorded as reviewed-and-refused
rather than merely absent. On the first install after the upgrade pnpm rewrites the old key
into the new one itself, leaving each entry as placeholder text that has to be answered.

A major pnpm upgrade also wants to purge `node_modules` first, and prompts to confirm it. That
prompt is a hang where nothing can answer it; `CI=true` takes the purge, and needs
`--no-frozen-lockfile` alongside it whenever the lockfile is meant to change, because CI mode
freezes it by default.

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
pnpm i18n              # watcher — does not exit
pnpm i18n --no-watch   # one-shot: regenerate and return
```

The type definitions and utility files under `src/lib/i18n/` are the output; edit the
locale files under `en/` and `ar/`, then regenerate. Use the watcher while working, and
`--no-watch` anywhere something has to wait for it to finish — pnpm forwards the flag to
`typesafe-i18n`, verified on 5.27.1.

**Regenerate before typechecking.** `TranslationFunctions` is generated, so a key that
exists in `en/index.ts` does not exist on the type until the generator has run.

Regenerating rewrites the whole of `src/lib/i18n/i18n-types.ts`, so it also picks up any
locale edit made since the last run. Expect hunks you did not author, and disclose them
rather than reverting them — the generated file was stale, not your diff wrong.
