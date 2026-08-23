---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: reference
use-when: "installing dependencies or running any repository script"
---

# pnpm

The package manager and the entry point for every script in this repository. `engine-strict`
is on and the engines are pinned — **pnpm 11+ on Node 24**. npm and yarn will refuse or
produce a lockfile CI rejects.

Docs: <https://pnpm.io/cli/add>. Fetch when a command needs a flag not listed here — overrides,
or anything touching the lockfile.

## The workspace, and which tool runs what

`pnpm-workspace.yaml` declares `apps/*` and `packages/*`. There are five packages, and the root
is a private, unversioned container named `rentable`. The scope is what keeps them distinct: the
root holds the product's name, and every package under it is named within that scope.

| Package | Where | What it is |
| --- | --- | --- |
| `@rentable/desktop` | `apps/desktop/` | the desktop application |
| `@rentable/control-plane` | `apps/control-plane/` | the always-online tier that holds accounts, workspaces and membership |
| `@rentable/workspace-migrations` | `packages/workspace-migrations/` | the SQL a workspace database is built from |
| `@rentable/workspace-permission` | `packages/workspace-permission/` | what a member may do to a workspace, named the same way on both sides |
| `@rentable/design` | `packages/design/` | the interface every rentable client is drawn from |

*There was one until 2026-08-18, when #549 cut the second. This paragraph said "three packages"
and named the first three until 2026-08-23, by which point there were five — the count is the
part of it that goes stale, which is why it is a table now.*

**`pnpm install` reports six workspace projects, not five.** The root counts as one. A read that
expects the package count to match is off by one and always will be.

**pnpm declares the workspace; Turborepo runs the tasks across it.** Which of the two a script
goes through is not arbitrary:

| From the root | Goes through | Why |
| --- | --- | --- |
| `build:web`, `test`, `test:rust` | `turbo run <task>`, against `turbo.json` | per package, cacheable, and what CI spends its time on |
| `build` | `pnpm --filter "./apps/*" build` | it bundles: the desktop's installers and the control plane's JavaScript. Nothing about it is cacheable by turbo, whose `outputs` describe `build/**` and not `tauri/target/**` |
| `check`, `lint`, `format` | plain root scripts | they cover *every file in the repository*, the root's own configuration included, which a per-package task cannot see |
| `dev` | `pnpm --parallel --filter "./apps/*" dev` | it runs *both* applications, which is what a person starting work wants; `--parallel` is what lets two long-running tasks share a terminal |
| `dev:desktop`, `dev:web`, `tauri`, `prototype`, `db:*:desktop`, `i18n` | `pnpm --filter ./apps/desktop <script>` | interactive or long-running, so there is nothing to cache; arguments are forwarded unchanged |
| `dev:control-plane`, `db:*:control-plane` | `pnpm --filter ./apps/control-plane <script>` | the same, for the other application |

**Filter by workspace path, never by package name** — `--filter ./apps/desktop`, in both tools.
Naming the package couples every root script to a name that can be renamed out from under it.

**Root `check` names no package at all**: it is `pnpm -r --if-present check && prettier --check .`,
which runs every package's own `check` and then the formatter over the whole tree. *Changed
2026-08-18 by #549, and the reason is the failure it prevents rather than tidiness — the script
filtered `./apps/desktop` alone, so the second package's typecheck would not have run in CI
while the step reading `pnpm check` said it had.* `-r` excludes the root, `--if-present` is what
lets a package have no `check`, and neither names anything that can be renamed. `lint` needed no
such change: root `lint` is `prettier --check . && eslint .`, both of which walk the whole tree
already.

**A root script names its application last, and the root only carries what more than one
application has.** `dev`, `build` and `db:` are the shapes both applications share, so the root
spells out which one it means and never leaves it implied:

```bash
pnpm db:migrate:desktop                         # the workspace schema, into DATABASE_URL
pnpm db:migrate:control-plane                   # accounts, workspaces, membership, sessions
pnpm dev:control-plane                          # run it locally, on its own
pnpm --filter ./apps/control-plane <script>     # anything the root does not carry
```

**Naming the application is not decoration.** A bare `db:migrate` meant the desktop's workspace
schema and the control plane's answered to a different prefix, which is two databases behind one
verb and the kind of thing that is only noticed after the wrong one has been migrated. *Renamed
2026-08-20: `control-plane:db:migrate` is `db:migrate:control-plane`, and `db:migrate` alone is
gone rather than resolved.*

**An operation only one package can perform stays in that package.** `sweep`, `decline` and
`prune-sessions` are the control plane's and have no root alias, so they are typed with a filter
from anywhere else. A root alias for a script with nothing to be symmetrical with is a second
name for one thing, and the root is where the names that mean *both applications* live.

```bash
pnpm --filter ./apps/desktop check      # one script per invocation — anything after
pnpm --filter ./apps/desktop lint       # the script name is an argument TO that script
pnpm exec turbo run test --filter=./apps/desktop
```

`turbo.json` declares `inputs` for `test:rust` explicitly. **An explicit `inputs` glob makes
turbo walk the filesystem instead of git**, so the negations for `tauri/target`, `tauri/gen` and
the SQLite files are what keep 69,000 machine-written paths out of the hash — without them the
task can never cache. Adding a task with narrowed `inputs` means checking the same thing: that
it still *misses* when the code it covers changes.

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

## A version under a day old will not install

`minimumReleaseAge` defaults to **1440 minutes — one day — in pnpm 11**, where pnpm 10
defaulted to `0`. Nothing here sets it: the value is inherited, and the upgrade in #205 is
what switched it on. It exists because malicious releases are usually pulled from the
registry within the hour, so waiting a day is most of the protection for none of the effort.

Install then rejects anything newer than the cutoff, transitive dependencies included:

```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 2 lockfile entries failed verification:
  globals@17.9.0 was published at ..., within the minimumReleaseAge cutoff
```

**A red dependency-update pull request less than a day old is this, not a broken update.**
It clears itself when the newest entry in its lockfile ages past the cutoff — re-run the
job. The error text advises `pnpm clean --lockfile` and a reinstall; do not follow it here,
because a lockfile that satisfies the cutoff is one that no longer contains the update the
pull request exists to make.

`minimumReleaseAgeExclude` exempts a package by name, wildcard, or exact version. It turns a
wait into a standing hole in the policy, so it is for a genuinely urgent security fix, never
for making a red check green.

Docs: <https://pnpm.io/settings/dependency-resolution>.

## Run the app

```bash
pnpm dev                          # the control plane and the desktop app, together
pnpm dev:desktop                  # the desktop app alone; see tauri.md
pnpm dev:control-plane            # the control plane alone
pnpm dev:web                      # vite only, port 1420 (strict) — no desktop window
pnpm prototype /contracts?create  # the desktop app, opened on one route; see tauri.md
```

**`pnpm dev` runs both applications**, changed 2026-08-20 by #627. It used to be the vite-only
script, which now answers to `dev:web`. The rename is what the sign-in wall forced: since #571
the desktop cannot reach a workspace without a control plane, so a `dev` that started the
frontend alone started the half that cannot do anything.

`pnpm dev:web` gives you the frontend with no Rust side, so anything touching the database or a
Tauri command will fail and the sign-in wall never clears. It is for UI work only.

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

The type definitions and utility files under `apps/desktop/src/lib/i18n/` are the output; edit the
locale files under `en/` and `ar/`, then regenerate. Use the watcher while working, and
`--no-watch` anywhere something has to wait for it to finish — pnpm forwards the flag to
`typesafe-i18n`, verified on 5.27.1.

**Regenerate before typechecking.** `TranslationFunctions` is generated, so a key that
exists in `en/index.ts` does not exist on the type until the generator has run.

Regenerating rewrites the whole of `apps/desktop/src/lib/i18n/i18n-types.ts`, so it also picks up any
locale edit made since the last run. Expect hunks you did not author, and disclose them
rather than reverting them — the generated file was stale, not your diff wrong.
