---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: reference
mode: [implement, test]
use-when: "running a task across this monorepo's packages, or explaining why one was skipped"
---

# Reference — Turborepo

**This file is yours.** Installed because a `turbo.json` was detected. Read it
for the task graph — which tasks depend on which, and what each one caches.

## The tasks that exist here

**`turbo.json` defines three, and `build` is not one of them.** Turbo refuses a task it
has no definition for, so a command naming one runs nothing:

| Task | Runs | Caches |
| --- | --- | --- |
| `build:web` | the frontend bundle, after `^build:web` | `build/**` |
| `test` | the TypeScript suites | nothing |
| `test:rust` | the Rust suites | nothing |

**`build:web` rather than `build` is deliberate**, and `turbo.json` carries the reasoning:
the desktop's `build` bundles installers through the Tauri CLI, which is minutes of cargo
and outputs the task's `outputs` do not describe. So no package's installer build is
reachable from turbo at all.

**Building is therefore a pnpm script here, never a turbo task.** Root `build` is
`pnpm --filter "./apps/*" build` and includes those installers; `build:control-plane` and
`build:desktop` reach one application each. The `integration` workflow runs `pnpm build:web`
and `pnpm build:control-plane`, and nothing anywhere runs `turbo run build`.

*This section said `turbo run build` was this repository's build command until 2026-08-22.
It never was under this `turbo.json`, and the same stale claim was sitting in
`apps/control-plane/README.md`, where it was read as evidence during a plan.*

## Commands

```sh
turbo run test                   # every package, in dependency order
turbo run test --filter=<pkg>    # one package
turbo run test --filter=<pkg>... # a package and everything it depends on
turbo run test --force           # ignore the cache
turbo run test --dry=json        # what would run, and why
```

The root scripts are the entry points and each wraps exactly one of them: `pnpm test`,
`pnpm test:rust`, `pnpm build:web`.

## The cache is the thing to understand

A task reported as **cached** did not run. That is the point, and it is also the
trap: a passing `turbo run test` may have executed nothing at all.

**When a result matters as evidence, say whether it was cached** — and re-run
with `--force` if it was (`[[policies/engineering]]`). A task whose `inputs` are
declared too narrowly caches across a change that should have invalidated it,
which is a finding about `turbo.json`, not about the run.

## Failure handling

- A task that "does not exist" is usually undeclared in `turbo.json` for that
  package, even though the script is in its `package.json`.
- Remote caching, where enabled, shares results between machines. A local result
  can come from CI. `--dry=json` shows the source.
- Never run a `publish`, `release`, or `deploy` task.
