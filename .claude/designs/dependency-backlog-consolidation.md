---
status: accepted
sources:
  - package.json
  - tauri/Cargo.toml
  - .github/renovate.json
  - .github/workflows/
  - .claude/evidence/research/dependency-backlog-consolidation.md
---

# chore(deps): consolidate the Renovate backlog into one update

## Problem

Thirteen Renovate pull requests are open against `main`. They are not independent: the
non-major group and four of the major updates propose different versions of the same
packages, and every one of them rewrites `pnpm-lock.yaml`, `Cargo.lock`, or both. Merging
any one invalidates the rest, so the backlog can only be cleared serially with a rebase and
a full CI run between each — thirteen times, on a gate that ends in a production Tauri
build.

Three of the thirteen cannot be merged at all in the form Renovate proposes, and nothing in
the pull requests says so. One of them — the `libsqlite3-sys` bump — proposes a version that
satisfies neither the current nor the next `sqlx` requirement, so it has never been
mergeable and will be regenerated every week until the configuration says otherwise.

## Goal

One change lands every update that can be taken, `main` reaches the versions Renovate is
targeting, and Renovate closes the corresponding pull requests on its next run. The three
that cannot be taken are recorded as their own work with the reason attached, rather than
sitting in the backlog looking like ordinary bumps that nobody got to.

## Constraints

- **The gate is all-or-nothing.** CI runs typecheck and format, ESLint, the TypeScript
  tests, the Rust tests, and a production Tauri build; a consolidated change is green only
  when every ecosystem is.
- **`libsqlite3-sys` is pinned exactly, and the pin is load-bearing.** The direct dependency
  exists only to enable bundled SQLite for the copy `sqlx` resolves. `=0.30.1` is the one
  value satisfying both `sqlx` 0.8.6 and 0.9.0; the proposed `=0.38.1` satisfies neither.
- **Credentials stay in Rust.** The credential store is part of the boundary ADR 0003 draws,
  so anything touching it is a change to that boundary's implementation and not a bump.
- **No changeset.** Dependency updates that no user can observe do not take one, and
  releases here are driven from changesets.
- **Renovate closes a pull request when it sees the dependency already at target on the
  default branch.** Anything deliberately not taken keeps its pull request, which is the
  intended behaviour, not a leak.

## Architecture

Three surfaces move, and they are independent of each other except through the gate:

- **The npm manifest and its lockfile** — application and toolchain dependencies, including
  the linter and formatter that the gate itself runs.
- **The Rust manifest and its lockfile** — the desktop shell, the database stack behind the
  persistence layer, and the HTTP and credential stack behind the sync boundary.
- **The workflow definitions** — the actions the gate and the release are built from. These
  touch no application code and fail loudly and immediately.

A fourth surface is configuration rather than dependency: the Renovate policy itself, which
is what stops the invalid `libsqlite3-sys` proposal returning.

The consolidated change deliberately does **not** move the persistence layer's database
driver or the sync boundary's credential store. Both are carved out, which is what keeps the
consolidated change a dependency update rather than a dependency update wearing two
migrations.

## Approach

Take everything whose only cost is a version number, in one commit, in this order — cheapest
signal first, so a failure is attributed before the expensive build runs:

1. **Workflow actions.** No local verification possible and none needed; they fail on the
   first CI run and nowhere else.
2. **The Renovate policy.** One rule disabling `libsqlite3-sys`, carrying the reason.
3. **The Rust manifest.** Resolution is already proven; `cargo check` then the Rust tests
   settle whether the surviving API surfaces changed signature.
4. **The npm manifest.** ESLint 10 and the non-major group must move together — the ESLint
   plugins currently locked predate ESLint 10 support, so neither half is safe alone.
5. **Formatting last.** Prettier and its Svelte plugin both move, and both may reformat the
   tree. Running the formatter after everything else is settled keeps that churn out of the
   diff being debugged.

The risky part is step 4, and it is deliberately not first: it is the only step whose failure
mode is a peer-resolution error rather than a compile error, and the evidence that it
resolves is a peer-range reading rather than an install.

**Three updates are carved out**, each with a verified reason:

- **TypeScript 7** is blocked upstream. No published `typescript-eslint` and no published
  `svelte-check` accepts it — both cap below 7 — so both halves of the gate fail at peer
  resolution. There is nothing to migrate to, and the ticket exists to hold the finding until
  the toolchain moves, not to schedule work.
- **keyring 4** is a restructured crate. All four features the platform blocks name were
  removed, and the crate split into a core plus per-platform store crates. It is a rewrite of
  the credential store's platform wiring.
- **sqlx 0.9** removed `runtime-tokio-rustls`, the feature the database stack is built on,
  and replaced the reason the `libsqlite3-sys` pin exists — bundling is now an sqlx feature.
  Taking it deletes the pin rather than carrying it forward, which makes it the one carve-out
  that improves the manifest rather than just advancing it.

**Options considered and rejected:**

- **Merge the thirteen serially.** Rejected: every merge invalidates the remaining twelve
  lockfiles, so it is thirteen rebases and thirteen full gate runs, and the four overlapping
  packages have to be reconciled by hand anyway.
- **A Graphite stack, one update per branch.** Rejected for the same reason at a smaller
  scale — every branch in the stack rewrites the same two lockfiles, so each restack is a
  conflict in a generated file. The lockfiles are what make this work resist splitting.
- **Take every update including the three carve-outs.** Rejected because TypeScript 7 is not
  takeable at any effort, and because bundling two platform migrations into a bump makes the
  change unreviewable — a reviewer cannot take the dependency update without also taking the
  credential-store rewrite.
- **Take only what needs zero code changes.** Rejected as too conservative: it would defer
  ESLint 10, better-sqlite3 13, and the Prettier plugin on suspicion rather than evidence,
  leaving most of the backlog open.
- **Automerge non-majors in future, or regroup majors per ecosystem.** Rejected for now —
  both change the review cadence, and neither is needed to solve the problem in front of us.
  The single invalid proposal is what recurs, and one rule stops it.

## Acceptance criteria

- The full CI gate passes on the consolidated change: typecheck and format, ESLint, the
  TypeScript tests, the Rust tests, and a production Tauri build.
- `main` carries the target versions for all ten takeable updates across the npm manifest,
  the Rust manifest, and the workflow definitions.
- The application still builds, launches, and reaches its local database — the bundled
  SQLite path is unchanged, which is what holding the pin is for.
- Renovate closes the pull requests for the ten taken updates on its next scheduled run,
  without a human closing any of them by hand.
- Renovate no longer proposes a `libsqlite3-sys` bump on subsequent runs.
- The three carve-outs are open tickets naming their blocker, and their Renovate pull
  requests remain open.

## Risks

- **The formatter reformats the tree.** Prettier and its Svelte plugin both move a major or
  minor. Detection is immediate — `pnpm check` fails on formatting — and the mitigation is to
  run the formatter as its own step and let the churn be visible rather than mixed in.
- **pnpm 11 rewrites the lockfile wholesale.** Unverified. It surfaces on the first local
  install, and it makes the diff large but not wrong. A second, related unknown: whether
  `pnpm/action-setup@v6` honours a `packageManager` field naming pnpm 11 — that one only
  surfaces in CI.
- **`base64` 0.23 or `getrandom` 0.4 changed a signature.** The items the code calls still
  exist at those versions, but existence is not compatibility. `cargo check` finds it in one
  step, and both are small, local call sites.
- **`tauri-action` v1.0.0 changed its inputs.** Entirely unverified, and the worst-placed
  risk in the set: it lives in the release workflow, so it is not exercised by the pull
  request gate at all and fails after merge. Read its inputs against the current invocation
  before taking it, or leave it for its own change.
- **ESLint 10 fails to resolve despite the peer ranges.** The ranges were read from the
  registry rather than proven by an install. It fails at install time, before anything is
  built, and the fallback is to drop ESLint 10 from the change and let its pull request stand.
- **TypeScript is capped below 6.1 by `typescript-eslint`, and nothing in the manifest says
  so.** No 6.1 exists today, so `^6.0.0` is currently safe and no action is proposed — but a
  6.1 release would break the gate through a range the repository already permits.

## Out of scope

- The `chore: version package` pull request. It is the changesets release automation, is
  regenerated on every push to `main`, and is not a dependency update.
- Any change to how Renovate groups, schedules, or automerges updates beyond the single
  rule disabling `libsqlite3-sys`.
- Migrating the database stack to sqlx 0.9, the credential store to keyring 4, or the
  toolchain to TypeScript 7 — each is its own ticket.
- Removing the direct `libsqlite3-sys` dependency. It becomes removable only under sqlx 0.9,
  so it belongs to that ticket.

## Proposed ticket set

Created as #200 (root), #201, #202, and #203.

---

### 01 — chore(deps): update all dependencies

Status: open · Blocked by: — · **root**

**Problem.** Thirteen Renovate pull requests are open, overlapping on four packages and all
rewriting the same two lockfiles, so none can be merged without invalidating the others.

**Outcome.** One change carries every takeable update — the workflow actions, the Rust
manifest, the npm manifest including ESLint 10 and the non-major group — plus the Renovate
rule that stops the invalid `libsqlite3-sys` proposal recurring. `libsqlite3-sys` stays at
`=0.30.1`; `sqlx` and `keyring` are untouched.

**Acceptance.**
- The full gate passes: typecheck and format, ESLint, TypeScript tests, Rust tests, and a
  production Tauri build.
- The application launches and reaches its local database, with bundled SQLite unchanged.
- Renovate closes the pull requests for the taken updates on its next run, with none closed
  by hand.
- Renovate proposes no further `libsqlite3-sys` bump.
- `tauri-action` v1's inputs are checked against the current release-workflow invocation
  before it is taken; if they changed incompatibly it drops out of this ticket and its pull
  request stands.

---

### 02 — chore(deps): move the database stack to sqlx 0.9

Status: open · Blocked by: 01 · Part of: dependency-backlog-consolidation

**Problem.** sqlx 0.9 removed `runtime-tokio-rustls`, the feature the database stack is
built on, so the update cannot be taken as a version bump. The direct `libsqlite3-sys`
dependency also exists only because sqlx 0.8 offers no way to ask for bundled SQLite.

**Outcome.** The database stack builds on sqlx 0.9 with the runtime and TLS choices named
separately, keeping the ring provider and no `aws-lc-rs` in the tree. Bundling becomes
sqlx's own concern and the direct `libsqlite3-sys` dependency — and its Renovate exclusion —
are deleted rather than carried forward.

**Acceptance.**
- The Rust tests and a production Tauri build pass on sqlx 0.9.
- The application reaches an existing local database and its migrations still apply.
- No `aws-lc-rs` appears in the resolved dependency tree.
- Neither the manifest nor the Renovate configuration mentions `libsqlite3-sys`.

---

### 03 — chore(deps): migrate the credential store to keyring 4

Status: open · Blocked by: 01 · Part of: dependency-backlog-consolidation

**Problem.** keyring 4 removed every feature the three platform blocks name and split the
crate into a core plus per-platform store crates, so the credential store's platform wiring
has to be rewritten rather than bumped.

**Outcome.** Google Drive credentials are stored, read, and deleted through keyring 4 on
Windows, macOS, and Linux, with the credential boundary ADR 0003 draws unchanged — nothing
moves out of Rust.

**Acceptance.**
- Linking a Google Drive account, restarting the application, and syncing works without
  re-authenticating.
- Unlinking removes the stored credential, and a subsequent read reports no entry rather
  than an error.
- The Rust tests pass and a production Tauri build succeeds on all three platforms.

---

### 04 — chore(deps): adopt TypeScript 7

Status: open · Blocked by: 01 · Part of: dependency-backlog-consolidation

**Problem.** TypeScript 7 is current, but no published `typescript-eslint` and no published
`svelte-check` accepts it — both cap below 7 — so both halves of the gate fail at peer
resolution. This is an upstream block, not work waiting on a decision. The ticket holds the
finding so the backlog does not carry it as an ordinary bump.

**Outcome.** The toolchain runs on TypeScript 7 once the linter and the checker support it.

**Acceptance.**
- `typescript-eslint` and `svelte-check` both declare TypeScript 7 support before this is
  started.
- The full gate passes with TypeScript 7.
