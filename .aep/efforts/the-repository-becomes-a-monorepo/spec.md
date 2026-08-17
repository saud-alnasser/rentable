---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: accepted
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
6. The desktop release — its `v*.*.*` tag, its four-platform artifacts, and the updater feed
   they publish — behaves as it does today.
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

- **The updater feed and the `v*.*.*` tag scheme are a public contract.** Applications already
  installed on users' machines read them. A restructure that changes either without a migration
  path breaks updates for every existing install, and the breakage is discovered by users on the
  next release rather than by CI.
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

- **pnpm workspaces is the tool.** pnpm is already the package manager, `pnpm-workspace.yaml`
  already exists, and the engines field already pins pnpm. Choosing a different tool is
  possible and is decision 02's to make; this assumption is what the sizing below is against.
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
  The root becomes private and unversioned, and `v*.*.*` is cut from `apps/desktop/package.json`.
  Both changeset scripts read the root's `version` today and must be repointed — see *Technical
  Approach*.
- ~~**Does changesets stay single-tag, or move to per-package tags?**~~ **Single-tag, unchanged.**
  `v*.*.*` keeps meaning the desktop release. Per-package tags are what a second *publishable*
  package needs, and this effort publishes none; the change is deferred to the effort that first
  needs one.
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
  a real update.
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
| `package.json` | splits: `apps/desktop/package.json` takes the application's dependencies, scripts and **version**; the root keeps `private: true`, the dev tooling shared by every package, `engines` and `packageManager`, and carries **no version** |
| `pnpm-workspace.yaml` | gains `packages:`, keeping its existing `allowBuilds` |
| `scripts/seed.ts`, `scripts/purge.ts`, `scripts/tauri-with-env.mjs`, `scripts/prototype.mjs` | `apps/desktop/scripts/` — all four address the application's database, its Tauri CLI, or its prototype switcher, and none is workspace-wide |
| `eslint.config.js`, `.prettierrc`-equivalent config, `.changeset/` | stay at the root — they govern every package |
| `.aep/` | stays at the root, unmoved |

# Interfaces

The interface this effort actually changes is **the set of commands a person or a workflow runs**,
and it is the thing requirement 7 is about. It gains one rule: every script exists at the root and
delegates, and exists in the package and does the work.

- Root scripts delegate with `pnpm --filter`, so `pnpm check`, `pnpm lint`, `pnpm test`,
  `pnpm build` and `pnpm test:rust` keep working from the repository root and fan out to every
  package that defines them.
- The same names in `apps/desktop/package.json` do the work for that package alone.
- `pnpm --filter desktop <script>` is therefore the per-package form requirement 7 asks for, with
  no second vocabulary to learn.

# Technical Approach

**The Tauri build.** `apps/desktop/tauri/tauri.conf.json` keeps `frontendDist: "../build"` —
because `tauri/` moves *with* the application, the path from the config file to the build output
is unchanged. `beforeDevCommand` and `beforeBuildCommand` keep `pnpm dev` / `pnpm build` and gain
an explicit `cwd` pointing at the desktop package, rather than relying on a default the reference
does not state (recorded in the evidence file). `scripts/tauri-with-env.mjs` pins the config path
explicitly instead of letting the CLI discover it.

**Versioning and the release tag — this is the part that carries the public contract.** Today
`.github/changeset-tag.cjs` does `require('../package.json')` and cuts `v${version}` from the
**root** package, and `.github/changeset-version.cjs` reads `package.json` at the working
directory and writes that version into `tauri/Cargo.toml`. Under the chosen layout the root has no
version at all, so both scripts read a field that is gone and the tag would be cut from
`undefined`. Both are repointed at `apps/desktop/package.json`, and the Cargo sync follows the
path to `apps/desktop/tauri/Cargo.toml`.

**The tag scheme does not change.** `v*.*.*` continues to mean *the desktop release*, cut from the
desktop package's version, and `release.yml`'s `git tag --list 'v*.*.*'` detection is untouched.
This answers the spec's open question in favour of staying single-tag: the tag is read by
already-installed applications through the updater, and a scheme change is a break that is
discovered by users. Per-package tags are what a second *publishable* package would need, and this
effort publishes none — so the change is deferred to the effort that first needs it, under the
same removal-condition discipline as the schema.

**Changesets** keeps `privatePackages: { version: true, tag: true }`. It versions the packages it
finds in the workspace; the root, having no version, is not one of them.

**Drizzle.** `drizzle.config.ts` moves to `apps/desktop/` and its two relative paths —
`./src/lib/platform/database/schema.ts` and `./tauri/migrations` — are unchanged, because both
endpoints moved together. This is the concrete payoff of not extracting the schema.

**CI.** `integration.yml` runs `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm exec eslint .`,
`pnpm test`, `pnpm test:rust`, `pnpm build`, and `cargo build --release --manifest-path ./tauri/Cargo.toml`.
The first six keep working through the delegating root scripts; the two `--manifest-path` arguments
in `integration.yml` and `release.yml` follow the crate to `apps/desktop/tauri/Cargo.toml`. The
cache keys built from the tree hash are unaffected.

# Migration

Ordered, because the intermediate states have to stay buildable.

1. Declare `packages:` in `pnpm-workspace.yaml` and create `apps/desktop/package.json` carrying
   the application's dependencies, scripts and the current version `0.12.0`.
2. Move the tree with `git mv`, in one commit that moves and changes nothing else — so the diff
   reads as renames and review is possible.
3. Split the root `package.json`: strip the application's dependencies and scripts, remove
   `version`, add the delegating scripts, keep `engines`, `packageManager` and the shared dev
   tooling.
4. Repoint the two changeset scripts and the two `--manifest-path` arguments.
5. Set the Tauri hooks' `cwd` and pin the config path in `scripts/tauri-with-env.mjs`.
6. Regenerate the lockfile with `pnpm install`, and verify `pnpm-lock.yaml` resolves the workspace
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
| 6 — **the release still updates an installed app** | the one criterion no CI run can satisfy. Cut a release from the restructured tree, install the *previous* version on a real machine, and let its updater find and apply the new one. This is a manual gate and it is the reason this effort is not done when CI is green |
| 7 — scripts run from root and per package | run all five from the root and all five under `pnpm --filter desktop`, in CI |

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
- **`pnpm --filter` name drift.** The root scripts name the package; renaming the package silently
  breaks every root script. Mitigated by filtering on the workspace path rather than the package
  name where pnpm allows it.
- **A default `cwd` this plan does not rely on may still be inherited somewhere** — the Tauri CLI's
  own project detection was not verified (recorded in the evidence file's *Not checked*). Mitigated
  by pinning the config path explicitly in `scripts/tauri-with-env.mjs` rather than discovering it.
- **`.svelte-kit/tsconfig.json` is generated**, and `tsconfig.json` extends it by relative path.
  If `svelte-kit sync` is run from the wrong directory the extend target does not exist and the
  failure is a type error storm rather than a clear message.

## Scope changes this plan surfaced — surfaced, then settled

[[rules/change-control]] requires these to stop and be surfaced rather than folded into the HOW.
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

Status: **decided 2026-08-17 — option A.** The three approaches, their costs and the reasoning
are in `# Architecture` above; this section keeps the question it was opened with.
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
