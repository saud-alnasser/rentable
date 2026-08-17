---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: implemented
---

# Problem

This repository can hold exactly one publishable thing, and it holds it by assumption
rather than by decision.

There is one package at the root — SvelteKit, with `tauri/` beside it. `pnpm-workspace.yaml`
exists but declares no `packages:` at all, only `allowBuilds`, so pnpm is the package manager
and not a workspace tool. Changesets is configured for that one private package
(`privatePackages: { version: true, tag: true }`) and the release workflow versions it,
detects the newest `v*.*.*` tag, and builds desktop artifacts for four platforms off exactly
that tag. Tauri finds its frontend at `frontendDist: "../build"`, produced by `pnpm build` at
the root.

Every one of those is correct for one package and wrong for two. A second publishable
thing — an API, a shared schema package, a second client — has nowhere to go that does not
break the version tag, the changelog, or the Tauri build. The cost lands on the next effort
rather than here: [[efforts/a-workspace-follows-its-user/spec]] is a repository shape, an
identity model, and a persistence relocation, and all three of them land inside whatever this
decides. Planning them against a layout that has not been chosen means planning twice.

# Goal

The repository holds more than one package. A change to any of them is versioned, changelogged
and released without disturbing the others, and the desktop application builds, releases and
updates exactly as it does today.

# Scope

- The workspace tool, and the package layout it declares.
- Where the shared schema lives, so more than one consumer reads one description of it rather
  than a copy.
- How the Tauri build finds its frontend once that frontend is a package rather than the root.
- Changesets with more than one versionable package: what gets a version, what gets a tag, and
  what the changelog is per.
- The release workflow's tag detection and artifact job.
- The remaining CI workflows, and the root tooling configuration that assumes a root package —
  `tsconfig.json`, `eslint.config.js`, `vite.config.js`, `drizzle.config.ts`, `components.json`,
  and the scripts under `scripts/`.

# Requirements

1. The repository declares a workspace of packages, and the desktop application is one of them.
2. One description of the database schema is consumed by every package that needs it, with no
   second copy.
3. The desktop application builds, in development and for release, without a step that reaches
   outside its own package by hand-written relative path.
4. Adding a package requires no change to the release workflow's structure.
5. Versioning and changelogs are per package, and a change to one does not version another.
6. The desktop release — its tag, its four-platform artifacts, and the updater feed they
   publish — behaves as it does today. **Amended 2026-08-17:** the tag itself moves to
   `@rentable/desktop@<version>`; what must not move is the *behaviour*, which is that an
   application installed from any earlier release still finds and applies the next one.
7. Every existing script, check, lint, format and test invocation still runs from the repository
   root, and each also runs scoped to a single package.

# Acceptance Criteria

1. The workspace manifest lists the packages, and `pnpm install` from a clean checkout resolves
   them without a lockfile conflict.
2. `grep` finds one schema module, and no copy of it. **Amended 2026-08-17**, when decision 02
   chose to defer the extraction: the original criterion also required a package other than the
   desktop application to import the schema through the workspace, which a one-package layout
   cannot produce. That half moves to the extraction, and is the criterion the removal condition
   in `# Architecture` is checked by.
3. `pnpm tauri dev` and `pnpm tauri build` both succeed from a clean checkout, and neither the
   Tauri configuration nor the build scripts contain a path that walks out of a package and back
   into another by name.
4. A second package added purely as a fixture is versioned and changelogged by the existing
   workflow with no edit to `release.yml`.
5. A changeset naming one package versions that package and leaves the others' versions
   unchanged, demonstrated on a dry run.
6. A release cut after the restructure produces artifacts for all four platform targets, and an
   application installed from the previous release detects and applies it. **Verified against a
   real update, not against the workflow succeeding.**
7. `pnpm check`, `pnpm lint`, `pnpm test`, and `pnpm test:rust` pass from the root, and each has
   a per-package form that passes.

# Constraints

- ~~**The updater feed and the `v*.*.*` tag scheme are a public contract.**~~ **Half of this was
  wrong, and it was the half doing the constraining. Corrected 2026-08-17** by reading the chain
  end to end — see
  [[efforts/the-repository-becomes-a-monorepo/evidence/research/the-updater-contract]].

  **The updater feed is a public contract; the tag scheme is not.** Installed applications poll a
  hard-coded endpoint that GitHub resolves through its latest-release pointer — most recent
  non-draft, non-prerelease release *by date*, tag name never consulted — and the version they
  compare is written into `latest.json` from the application, not from the tag. The contract is
  therefore exactly three things: **the endpoint URL, `latest.json`'s `version` field sorting
  above what is installed, and the signing key.** Change any of those without a migration path
  and updates break for every existing install, discovered by users rather than by CI. The tag is
  internal, and renaming it costs nothing.
- **Node `^24.0.0` and pnpm `>=11.0.0` stay pinned**, and `packageManager` stays exact. The
  toolchain version is not a thing this effort is also changing.
- **`$lib` and the existing import paths survive**, or move in one mechanical pass. A restructure
  that rewrites imports by hand across the tree is a restructure nobody can review.
- **The Rust crate keeps its own manifest and its own test invocation.** `cargo` is not brought
  under the JavaScript workspace tool.
- **Offline-first is untouched here.** This effort changes where files live, not what the
  application can do with no network.

# Out of Scope

- **Identity, accounts, and hosted persistence.** Those are
  [[efforts/a-workspace-follows-its-user/spec]], which depends on this one and is not merged
  into it.
- **Shipping a second client.** Room is made for one; none is built, and no package for one is
  created speculatively.
- **Publishing anything to npm.** The packages are internal. `access: "public"` in the changesets
  configuration is inspected, not acted on.
- **Building or deploying an API.** Same reason — the layout must admit one, and this effort
  does not write one.
- **The domain model, and every surface.** No contract rule, payment rule, component or route
  changes behaviour. A file may move; what it does may not.
- **Google Drive sync.** Its fate belongs to the sibling effort.
- **Migrating the Rust crate's layout.** `tauri/` keeps its shape.

# Assumptions

- ~~**pnpm workspaces is the tool.**~~ **Amended 2026-08-17** — pnpm workspaces *declares* the
  packages and **Turborepo runs the tasks across them.** The two are layers rather than
  alternatives: Turborepo has no workspace of its own and reads the package manager's. So pnpm
  stays for the reasons it was assumed — it is already the package manager, `pnpm-workspace.yaml`
  already exists, and `engines` already pins it — and what the amendment moves is `# Interfaces`,
  not the layout. See the amendment under `# Decisions`.
- ~~**Tauri's `frontendDist` can point into a package directory.**~~ **Verified** — no longer an
  assumption. `frontendDist` resolves relative to `tauri.conf.json`'s own directory and already
  leaves the Tauri directory in this repository (`../build`), and the before-build hooks take an
  explicit `cwd`. See
  [[efforts/the-repository-becomes-a-monorepo/evidence/research/tauri-frontend-path-in-a-workspace]].
- **The four-platform artifact matrix is unaffected by the layout**, because it consumes a tag
  and a built frontend rather than a package name.

# Open Questions

Four questions were open when this spec was drafted. `# Architecture` and `# Technical Approach`
answer all four; they are kept here with their answers so the reasoning is not re-derived.

- ~~**Does the desktop application keep the repository's version, or get its own?**~~ **Its own.**
  The root becomes private and unversioned, and the release tag is cut from
  `apps/desktop/package.json`. Both changeset scripts read the root's `version` today and must be
  repointed — see *Technical Approach*.
- ~~**Does changesets stay single-tag, or move to per-package tags?**~~ ~~**Single-tag,
  unchanged.**~~ **Per-package. Reversed 2026-08-17**, on the human's direction and on the
  evidence that the original answer's premise was false. The tag becomes
  `@rentable/desktop@<version>`, changesets' own workspace convention.

  The first answer deferred the change because per-package tags looked like something only a
  second *publishable* package needs, and because the `v*.*.*` scheme was believed to be part of
  the public contract. **It is not** — see the amended constraint above. With that premise gone,
  the deferral was buying nothing and costing a second migration later, at which point there
  would be more releases behind it rather than fewer. The old `v*.*.*` tags stay in the
  repository; the five published releases still point at them.
- ~~**Where does the shared schema actually live?**~~ **It stays in the desktop application**, and
  is extracted when a second consumer exists. The removal condition is in `# Architecture`.
- ~~**What happens to `scripts/`?**~~ **All four move to `apps/desktop/scripts/`.** Each addresses
  the application's database, its Tauri CLI, or its prototype switcher; none is workspace-wide.

What is genuinely still open:

- **Whether acceptance criterion 2's second half survives.** It asks for a cross-package importer
  of the schema, which option A does not produce. Amending the criterion or choosing option B is a
  spec decision, surfaced under *Scope changes this plan surfaced* rather than decided here.

# Risks

- **A broken updater is invisible until the release after it.** CI can prove the workflow ran;
  only a real installed application proves it updated. This is why acceptance criterion 6 names
  a real update — and why the tag change, though the evidence says it is inert, is still checked
  by installing an old-scheme build rather than by reasoning about it a second time.
- **A release that is left as a draft is not "latest".** GitHub's pointer excludes drafts, and
  `release.yml` sets `releaseDraft: true` — so publishing is a human step and always has been.
  Nothing here changes that, but it is now the single manual action standing between a green
  release run and users receiving an update, so it is worth having written down.
- **The restructure touches every path in the repository at once**, which makes the diff large
  and the review shallow exactly where a mistake is cheapest to make and most expensive to find.
- **A layout chosen for today's two packages may be wrong for the API**, whose shape is not yet
  known — decisions 03 and 05 on the sibling effort's map are open. Choosing a conventional
  layout rather than a clever one is the mitigation.

# Architecture

**Chosen: option A, a minimal workspace with the schema left where it is.** Agreed 2026-08-17.

The repository declares a pnpm workspace. Everything that is the desktop application — `src/`,
`static/`, `tauri/`, and the configuration that belongs to a SvelteKit project — moves into
`apps/desktop/`. The root becomes a private, unversioned container holding only workspace-wide
concerns: the lockfile, the changesets directory, the linting and formatting configuration, and
the AEP tree. **No `packages/` directory is created**, and the database schema stays at
`apps/desktop/src/lib/platform/database/schema.ts`.

*Why the schema is not extracted:* [[skills/plan/depth]]'s seam discipline — two adapters make a
real seam. The schema has exactly one consumer today, and it has twenty-plus importers inside
that one consumer. A `packages/schema` created now would be a single-consumer package: all of
the cost of a boundary, none of the substitutability. Worse, it would be a **guess at the wrong
boundary** — decisions 03 and 05 on [[efforts/a-workspace-follows-its-user/spec]] are open, and
the control plane they will define holds users, workspaces and membership, which is a *different*
schema from the workspace domain. Extracting one package now risks discovering that two were
needed and that the split runs somewhere else entirely.

**Removal condition, so "deferred" is a state and not an intention:** the schema is extracted
into its own package the moment a second consumer exists — which is when decision 03 lands and
names one. The extraction is a mechanical rewrite of one import specifier across the importers,
and it is safe precisely because the workspace already exists by then.

## The alternatives, and why they lost

Produced under conflicting constraints, per [[skills/plan/design-it-twice]].

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — minimal workspace, deferred extraction** *(optimise for the common caller)* | One mechanical move; no import specifier changes; the workspace exists and admits packages without guessing their shape | Requirement 2 is satisfied only trivially — one consumer, one description; the extraction is still owed later | The extraction later touches 20+ importers as a second, separate disruption | Lowest — the tree stays legible and nothing is maintained that has no consumer |
| **B — extract `packages/schema` now** *(maximise flexibility)* | The API arrives to a boundary that already exists; requirement 2 is satisfied substantively | 20+ import specifiers change inside the same commit that moves every file; `drizzle.config.ts` splits from the `tauri/migrations` it writes into | The boundary is drawn before the consumer that would justify it exists, and decisions 03/05 may put the control plane's schema somewhere else entirely | A package with one consumer is maintained on behalf of a caller that does not exist |
| **C — extract the schema *and* its migrations together** *(design around the seam)* | Deepest of the three: one interface hides both the table description and the migration history, which [[contexts/persistence]] already says change together | Moves `tauri/migrations/` out of the Rust crate that applies them, so the Rust migration runner's path changes | Touches Rust in an effort that is otherwise a JavaScript restructure, widening the diff into the half that CI covers least | Highest now, and possibly right later — it is B's problem solved rather than B's problem shipped |

**B loses to A on timing, not on merit.** Its boundary is the one this repository will probably
want; it is being drawn a decision too early. **C loses to A for the same reason and costs more**,
though it is the one to revisit when the removal condition fires — because C, not B, is the
version that keeps the schema and its migrations in one place.

# Components

| Component | Becomes |
| --- | --- |
| `src/`, `static/`, `src/app.css` | `apps/desktop/` — unchanged internally |
| `tauri/` | `apps/desktop/tauri/` — the crate keeps its own manifest and its own test invocation |
| `svelte.config.js`, `vite.config.js`, `tsconfig.json`, `components.json`, `drizzle.config.ts` | `apps/desktop/` — each belongs to a SvelteKit project, and `tsconfig.json` extends `./.svelte-kit/tsconfig.json`, which is generated beside the project |
| `package.json` | splits: `apps/desktop/package.json` takes the application's dependencies, scripts, **version** and the name **`@rentable/desktop`**; the root **keeps the name `rentable`** along with `private: true`, the dev tooling shared by every package, `engines` and `packageManager`, and carries **no version** |
| `pnpm-workspace.yaml` | gains `packages:`, keeping its existing `allowBuilds` |
| `scripts/seed.ts`, `scripts/purge.ts`, `scripts/tauri-with-env.mjs`, `scripts/prototype.mjs` | `apps/desktop/scripts/` — all four address the application's database, its Tauri CLI, or its prototype switcher, and none is workspace-wide |
| `.typesafe-i18n.json` | `apps/desktop/` — its `outputPath` is `./src/lib/i18n`, so it moves with the tree it writes into |
| `.env`, `.env.example` | `apps/desktop/` — every value in them is the application's: the database path, the updater public key, the Google OAuth client. `dotenv` resolves `.env` against the working directory, and after the move that directory is the package |
| `CHANGELOG.md` | `apps/desktop/` — changesets writes a changelog per versioned package, and the versioned package is the desktop application |
| `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.changeset/`, `README.md` | stay at the root — they govern every package. Three of them hold paths that follow the move: `eslint.config.js` imports `./svelte.config.js` and ignores `tauri/**` and `src/lib/i18n/i18n-*.ts`; `.prettierrc` points `tailwindStylesheet` at `./src/app.css`; `.prettierignore` lists `/static/`, `build`, `tauri/target` and the generated i18n modules |
| `turbo.json` | **new**, at the root — the task graph. It exists because Turborepo runs the per-package tasks; see `# Interfaces` |
| `.aep/` | stays at the root, unmoved |

# Interfaces

The interface this effort actually changes is **the set of commands a person or a workflow runs**,
and it is the thing requirement 7 is about. It gains one rule: every script exists at the root and
delegates, and exists in the package and does the work.

**Turborepo is the delegation mechanism** — amended 2026-08-17, see `# Decisions`. What it forces
is a split between tasks that are *per package* and tasks that are *per repository*, and both
halves are written down here because the second is where coverage is lost silently.

- **Per package, through the task graph.** `build`, `test` and `test:rust` are declared in
  `turbo.json` and run from the root as `turbo run <task>`, fanning out to every package defining
  the script. The same names in `apps/desktop/package.json` do the work for that package alone, and
  `turbo run <task> --filter=./apps/desktop` is the per-package form requirement 7 asks for.
- **Per repository, outside the task graph.** `check`, `lint` and `format` stay plain root scripts,
  because what they check is *every file in the repository* — the root's own configuration
  included — and a per-package task cannot see those files. Splitting them would leave the root
  covered by a second task free to drift out of agreement with the first, and a formatting gap
  reports nothing when it opens. `lint` and `format` are wholly repository-wide; `check` is
  prettier repository-wide plus one `pnpm --filter ./apps/desktop check` for the typecheck, which
  is inherently per-project because `svelte-check` reads the package's own `tsconfig.json`.
- **Per package, delegated directly.** `dev`, `preview`, `tauri`, `prototype`, `db:*` and `i18n`
  are interactive or long-running, so they are not tasks — there is no output to cache and the
  graph would only add a layer between a person and a window. They stay reachable from the root as
  `pnpm --filter ./apps/desktop <script>`, which forwards trailing arguments unchanged, so
  `pnpm tauri dev` and `pnpm prototype /contracts?create` read exactly as [[references/tauri]]
  documents them. **Requirement 7 is why these survive at the root at all**: it asks that *every*
  existing invocation still run from there, not only the five CI runs.

**Filtering is by path, never by package name** — `--filter=./apps/desktop`, in both tools. The
root keeps `rentable` and the application is `@rentable/desktop`, so packages are named within the
product's scope rather than beside it.

That naming was **changed once, after the scripts were already written and passing**, and nothing
in them had to move: the rename was two `name` fields and the whole gate stayed green. That is the
entire argument for filtering by path. Had the scripts named the package, every one of them would
have broken — silently, because `pnpm --filter` does not fail on a selector that matches nothing
unless `--fail-if-no-match` is set.

# Technical Approach

**The Tauri build.** `apps/desktop/tauri/tauri.conf.json` keeps `frontendDist: "../build"` —
because `tauri/` moves *with* the application, the path from the config file to the build output
is unchanged. ~~`beforeDevCommand` and `beforeBuildCommand` gain an explicit `cwd`.~~ **Corrected
2026-08-17 against the Tauri CLI source, during implementation** — they keep `pnpm dev` and
`pnpm build` as plain strings and set no `cwd` at all. `run_hook` resolves
`script_cwd.unwrap_or_else(|| frontend_dir)` and **joins a configured `cwd` to nothing**, so a
relative value resolves against the process's working directory — which `build.rs` sets to the
tauri directory beforehand and the `dev` path does not. One relative value cannot be right for
both, which makes writing the field the ambiguous choice rather than the safe one. The default is
`frontend_dir`, computed by walking for a `package.json` with the tauri directory's parent as
fallback; under this layout both land on `apps/desktop`. Full reasoning and sources in
[[efforts/the-repository-becomes-a-monorepo/evidence/research/tauri-frontend-path-in-a-workspace]].

`scripts/tauri-with-env.mjs` pins **the working directory** to its own package rather than the
config path, for the same reason: the CLI discovers `tauri.conf.json` by walking from the working
directory, and `--config` merges over what it discovers rather than replacing the discovery — so
that flag cannot pin what it was being reached for. The `.env` read is anchored the same way,
because `dotenv` also resolves against the working directory.

**Versioning and the release tag — this is the part that carries the public contract.** Today
`.github/changeset-tag.cjs` does `require('../package.json')` and cuts `v${version}` from the
**root** package, and `.github/changeset-version.cjs` reads `package.json` at the working
directory and writes that version into `tauri/Cargo.toml`. Under the chosen layout the root has no
version at all, so both scripts read a field that is gone and the tag would be cut from
`undefined`. Both are repointed at `apps/desktop/package.json`, and the Cargo sync follows the
path to `apps/desktop/tauri/Cargo.toml`.

**The tag scheme changes to `@rentable/desktop@<version>`** — amended 2026-08-17, reversing the
paragraph that stood here. The reasoning it replaced rested on the tag being read by installed
applications; it is not, and the amended constraint above says what actually is.

`changeset-tag.cjs` cuts `${name}@${version}`, **reading the name rather than spelling it** — a
tag that disagrees with the package it came from is a release nobody can trace back, and reading
it is also what lets a second publishable package tag itself without a second edit here.

`release.yml`'s detection is the one thing the rename genuinely breaks, and it breaks quietly:
left matching `v*.*.*` it would go on finding `v0.12.0`, see that a release already exists for it,
set `should_publish=false`, and **never publish again**. It moves to the package's own glob, and
gains a `release_version` output taken from **after the final `@`** — the scope means the tag
carries an `@` of its own, so splitting on the first one yields `rentable/desktop` as the version.

~~The release *title* stays `rentable v<version>`.~~ **The title follows the tag. Reversed
2026-08-17**, on the human's direction, to `@rentable/desktop v<version>`.

The paragraph this replaces argued that a person scans the releases page for the product's name
and that the tag moving was no reason for the product to appear renamed. What it missed is that
the page had stopped agreeing with itself: the tag, the changelog heading and the title named
three different things, and the title was the only one of the three still carrying the
pre-workspace name. Naming the package in it is what makes a release traceable to the package it
was cut from — the same argument `changeset-tag.cjs` is built on, applied one field later.

**Both halves are read off the tag, and nothing in `release.yml` spells a package.** The detection
step already split on the final `@` for the version; it now keeps the name half too and publishes
it as a `release_package` output, and the title recomposes the two. Reading rather than spelling is
the rule `changeset-tag.cjs` is built on — a release naming a package other than the one it was cut
from is a release nobody can trace back — and it is also requirement 4: a second publishable
package titles its own releases with no edit to the workflow.

Recomposed rather than used whole, because the tag joins name and version with `@`, and
`@rentable/desktop@0.12.1` on a page of titles reads as a tag rather than as a release. The five
published `rentable v*` releases keep their names; this changes what is cut next.

**Names.** The root keeps `rentable` and the application becomes `@rentable/desktop`, so packages
are named *within* the product's scope rather than beside it. This is free only because filtering
is by workspace path — see `# Interfaces`. `apps/desktop/CHANGELOG.md` keeps its `# rentable`
heading: changesets prepends under whatever heading it finds, and the file is 488 lines of the
product's history.

**Removal condition for the hand-rolled tag script:** when a second publishable package exists,
`changeset tag` replaces `changeset-tag.cjs`, because it tags every versioned package without
this one being edited per package.

**Changesets** keeps `privatePackages: { version: true, tag: true }`. It versions the packages it
finds in the workspace; the root, having no version, is not one of them.

**Drizzle.** `drizzle.config.ts` moves to `apps/desktop/` and its two relative paths —
`./src/lib/platform/database/schema.ts` and `./tauri/migrations` — are unchanged, because both
endpoints moved together. This is the concrete payoff of not extracting the schema.

**CI.** `integration.yml` runs `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm exec eslint .`,
`pnpm test`, `pnpm test:rust`, `pnpm build`, and `cargo build --release --manifest-path ./tauri/Cargo.toml`.
The first six keep working through the delegating root scripts. What follows the crate is five
paths, not two — **corrected 2026-08-17**, this plan and the ticket both said "the two
`--manifest-path` arguments in `integration.yml` and `release.yml`" and `release.yml` has none:

| Path | Where |
| --- | --- |
| `--manifest-path ./tauri/Cargo.toml` | `integration.yml` (1), `warm-cache.yml` (2) |
| `workspaces: './tauri -> target'` | `integration.yml`, `warm-cache.yml` — the `rust-cache` key, and the two **must stay identical** or every pull request compiles cold |

Two more workflow strings are path-bound and neither is a crate path. `integration.yml`'s
*classify the change* step decides whether the Rust steps run at all, from
`grep -qE '^(tauri/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.github/workflows/)'` —
after the move nothing matches `^tauri/`, so **the Rust half of the gate would silently stop
running**, which is the failure that fails open in the wrong direction. It gains the new prefix and
`turbo.json`. And the *verify the shell breakpoint survived the build* step greps
`build/_app/immutable/assets/`, which becomes `apps/desktop/build/_app/immutable/assets/`.

**Turborepo's cache is added inside the existing memo, not in place of it.** They answer different
questions and both are kept: `.integration-pass` is keyed on the whole tree's git hash and
short-circuits the entire job when these exact bytes already passed, while `.turbo` is keyed per
task and lets a run that *misses* the memo still reuse the tasks whose own inputs did not move — a
`.aep/` edit no longer re-runs `build`. A `actions/cache@v6` step on `.turbo`, keyed
`${{ runner.os }}-turbo-${{ github.sha }}` with a `${{ runner.os }}-turbo-` restore prefix, sits
before the task steps. No remote cache: `TURBO_TOKEN` and `TURBO_TEAM` are Vercel's and this
repository has neither.

# Migration

Ordered, because the intermediate states have to stay buildable.

1. Declare `packages:` in `pnpm-workspace.yaml` and create `apps/desktop/package.json` carrying
   the application's dependencies, scripts and the current version `0.12.0`.
2. Move the tree with `git mv`, in one commit that moves and changes nothing else — so the diff
   reads as renames and review is possible.
3. Split the root `package.json`: strip the application's dependencies and scripts, remove
   `version`, add the delegating scripts, keep `engines`, `packageManager` and the shared dev
   tooling.
4. Repoint the two changeset scripts, and every path in the table under *CI* above — the three
   `--manifest-path` arguments, the two `rust-cache` workspace keys, the change-classifier's
   prefix list, and the built-stylesheet grep.
5. Set the Tauri hooks' `cwd` and pin the config path in `scripts/tauri-with-env.mjs`.
6. Add `turbo.json` and the root `turbo` devDependency, point the root's `build`, `test` and
   `test:rust` at `turbo run`, and add the `.turbo` cache step to `integration.yml`.
7. Regenerate the lockfile with `pnpm install`, and verify `pnpm-lock.yaml` resolves the workspace
   rather than a single root project.

**Steps 2 and 3 are one landing.** Between them the repository does not build, and a branch that
lands step 2 alone leaves `main` broken.

# Testing Strategy

How each acceptance criterion is actually checked.

| AC | Checked by |
| --- | --- |
| 1 — workspace resolves | `rm -rf node_modules && pnpm install --frozen-lockfile` from a clean clone, in CI as it already runs |
| 2 — one schema module | `grep` for the schema path finds one file; the criterion's second half about a cross-package importer **cannot be checked under option A** and is deferred with the extraction — see *Scope changes* below |
| 3 — Tauri builds | `pnpm tauri dev` and `pnpm tauri build` from a clean checkout, run locally on one platform and by `integration.yml`'s existing `pnpm build` + `cargo build --release` steps |
| 4 — a package added needs no workflow edit | add a throwaway `packages/fixture` on a scratch branch, confirm changesets versions it and `release.yml` is untouched, then delete the branch |
| 5 — per-package versioning | `pnpm changeset version` on a scratch branch with a changeset naming one package; inspect the diff; discard |
| 6 — **the release still updates an installed app** | the one criterion no CI run can satisfy. Cut a release from the restructured tree, install a **`v*`-tagged** build — 0.12.0, the last of the old scheme — on a real machine, and let its updater find and apply the new one. That the *old* scheme is what gets installed is the point: it is the only check that the tag rename is as invisible to an installed application as the evidence says. Manual, post-merge, and the reason this effort is not done when CI is green |
| 7 — scripts run from root and per package | run all five from the root, then their per-package forms: `turbo run build test test:rust --filter=./apps/desktop` for the three that are tasks, and `pnpm --filter ./apps/desktop <script>` **one script per invocation** for `check` and `lint` — `pnpm --filter` takes a single script name and treats anything after it as arguments to that script |

**No test files are deleted by this effort.** [[skills/plan/depth]] requires naming coverage
changes; there are none, because nothing is merged behind a new interface — the tests move with
their packages and keep asserting exactly what they assert now. `src/**/*.test.mjs` becomes
`apps/desktop/src/**/*.test.mjs` and the test script's glob follows it.

# Operational Considerations

- **The updater is the blast radius.** Everything else in this effort fails loudly at build time.
  A tag cut from the wrong `package.json`, or a version that no longer matches `Cargo.toml`,
  produces a release that installs and never updates again — and it is discovered one release
  later, by users. Acceptance criterion 6 exists for this and is not negotiable down to a CI check.
- **`cargo update` runs inside the version script** and follows the crate's new path. A wrong path
  there fails the release job rather than corrupting it, which is the good failure mode.
- **The four-platform artifact matrix is unaffected** — it consumes a tag and a built frontend.

# Technical Risks

- **The move commit is large and reads as noise.** Mitigated by step 2 doing nothing but renames,
  so `git log --follow` and `git diff -M` both stay useful, and by keeping the split (step 3) in a
  separate commit within the same landing.
- **Filter name drift.** A root script that names the package breaks silently when the package is
  renamed — and this effort renames two things at once, so the risk is live rather than
  hypothetical. Mitigated by filtering on the workspace path in both tools, never on the name.
- **A cached task result is a claim that nothing relevant changed**, and Turborepo believes
  whatever `inputs` says. `test:rust` restricted to `tauri/**` is the sharp edge: get the glob
  wrong and a green run means "nothing was re-tested", reported identically to "everything
  passed". This is `[[policies/engineering]]`'s *obeying a rule means letting its check fire*, and it
  is why the `.integration-pass` memo is kept as the outer gate rather than replaced — the memo
  is keyed on the whole tree, so it cannot be wrong about what it covers.
- ~~**A default `cwd` this plan does not rely on may still be inherited somewhere.**~~ **Closed
  2026-08-17** by reading the CLI source rather than working around it: the hook default is
  `frontend_dir` and it is the value this layout wants, while the Tauri CLI's project detection
  walks from the working directory — so the thing worth pinning is the working directory, and
  `scripts/tauri-with-env.mjs` pins it. See *Technical Approach*.
- **A `turbo` `inputs` glob silently opts out of git.** Turbo's default hashing enumerates
  tracked files; naming `inputs` explicitly makes it walk the filesystem instead, so ignored
  build output falls into the hash. Observed on `test:rust`: `["tauri/**"]` pulled **69,430**
  `tauri/target` paths plus the live SQLite files, and the task could never cache — it paid 69k
  stats every run to rediscover that it had changed. Mitigated by negating the machine-written
  paths, and **checked by running it three times**: unchanged tree hits, a Rust source edit
  misses, a frontend-only edit still hits. A cache that never misses is a check that never fires,
  so the miss is the half worth proving.
- **`.svelte-kit/tsconfig.json` is generated**, and `tsconfig.json` extends it by relative path.
  If `svelte-kit sync` is run from the wrong directory the extend target does not exist and the
  failure is a type error storm rather than a clear message.

## Scope changes this plan surfaced — surfaced, then settled

[[policies/execution]] requires these to stop and be surfaced rather than folded into the HOW.
Both were, and both are now resolved.

- **Acceptance criterion 2's second half was unmeetable under option A.** It asked that a package
  other than the desktop application import the schema through the workspace, and a one-package
  layout produces no such importer. Put to the human alongside option B, which would have kept it.
  **Resolved 2026-08-17: option A chosen, criterion amended**, and the removed half became the
  check on the extraction's removal condition.
- **The spec's open question "does the desktop application keep the repository's version, or get
  its own?" is answered here** — it gets its own, and the root carries none. Written into the
  Technical Approach rather than left open, because it follows from the layout rather than being a
  separate choice.

# Decisions

Worked one per session. The number is the one this decision carries on the map,
[#497](https://github.com/saud-alnasser/rentable/issues/497), and it keeps that number here so
existing references still resolve.

## 02 — grilling(repository): what the monorepo's layout and tooling are

Status: **decided 2026-08-17 — option A**, **amended the same day on the tooling half.** The three
approaches, their costs and the reasoning are in `# Architecture` above; this section keeps the
question it was opened with, and the amendment below.
Part of: the-repository-becomes-a-monorepo
Type: grilling
Blocked by: —

**Question.** Today there is one package at the root — SvelteKit, with a `tauri/` directory
beside it — plus changesets and a release workflow built around exactly that shape. What
replaces it: which workspace tool, where the shared schema lives so client and API both consume
one description, how the Tauri build finds its frontend, and what happens to changesets and the
release workflow when there is more than one publishable thing.

This is the prefactor: everything on [[efforts/a-workspace-follows-its-user/spec]] lands inside
whatever it decides.

### Amendment, 2026-08-17 — Turborepo runs the tasks

**What changed.** The layout is untouched: option A stands, `apps/desktop/` is still the only
package, the schema is still not extracted, and pnpm still declares the workspace. What moves is
the *delegation mechanism* in `# Interfaces` — root scripts were to fan out with `pnpm --filter`,
and now `build`, `test` and `test:rust` fan out through `turbo run` against a task graph in
`turbo.json`, with a `.turbo` cache in CI beside the existing tree-hash memo. `check`, `lint` and
`format` stay outside the graph, repository-wide, for the reason given in `# Interfaces`.

**Who decided it, and on what.** The human, during `/implement` on #500, before any code was
written. It is recorded here rather than folded into the *how* because
`[[policies/execution]]` puts a tooling choice at plan level: `/implement` builds what was
planned or stops, and this changed what was planned.

**The argument against it, kept because it is the one this spec makes elsewhere.** `# Architecture`
refused `packages/schema` on the grounds that a boundary built before the consumer that justifies
it is cost without substitutability. A task graph over one package is the same shape: turbo's
fan-out, caching and `dependsOn` all describe relationships that do not exist yet, and until #497
lands a second package the graph is a one-node graph. The counter, and the reason it was taken: the
second package is a *named, accepted* effort rather than a speculative one, and unlike the schema
extraction — which would rewrite twenty-plus import specifiers — adopting turbo later would cost
one config file and five script lines. The cost of being early here is small and the cost of being
early there was not.

**What this amendment does not touch.** The tag scheme, the changeset scripts, the updater feed,
the four-platform matrix, `frontendDist`, and the Rust crate's manifest. Turborepo is above all of
them.

### Amendment, 2026-08-17 — the names, and the release tag

**What changed.** The human directed three things during the same `/implement` run: the root
package keeps the name `rentable`, the application becomes `@rentable/desktop`, and the release
tag moves to that package's own namespace, `@rentable/desktop@<version>`.

**The premise that had to be checked first.** The spec had answered *"single-tag, unchanged"*, and
had answered it on the strength of `# Constraints` calling the `v*.*.*` scheme a public contract.
That claim was **wrong**, and it was load-bearing — so the change could not be sized until it was
read end to end. It was, and the contract turns out to be the endpoint, `latest.json`'s `version`,
and the signing key; the tag is internal. Both the constraint and the open question above are
amended, and
[[efforts/the-repository-becomes-a-monorepo/evidence/research/the-updater-contract]] holds the
sources.

**Consequence worth stating plainly, because it was the human's actual question:** *no migration
mechanism is needed, and none is built.* Applications installed from any of the five `v*` releases
find the next release through the same unchanged endpoint. A hand-made compatibility tag beside
the new one would be machinery with no consumer — the same thing `# Architecture` refused for
`packages/schema`, and refused for the same reason.

**What it does not touch.** The endpoint, the signing key, the four-platform matrix, the
changelog's heading and history, and the version series itself — `@rentable/desktop` continues
from 0.12.0 rather than restarting. ~~The release *title*~~ was on this list and **came off it
later the same day** — see the reversal under `# Technical Approach`. It belongs to the same
question the tag does, and answering the two differently is what left the releases page naming
the package one way and the product another.
