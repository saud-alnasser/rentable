---
status: resolved
blocked-by: [01]
---
# chore: the turso-platform package is removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`packages/turso-platform` leaves the workspace, and every reference to it goes: `turbo.json`, `pnpm-workspace.yaml` if it names it, the lockfile, `tauri/build.rs`'s comments, and the `.aep/` rules and contexts that describe it ([[contexts/repository]], [[rules/module-layout]], [[rules/testing]]).

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [x] The directory is gone and `turbo run test --dry` lists no `turso-platform` task (criterion 16). Verified: `git ls-files packages/turso-platform | wc -l` printed `0` and `ls packages` lists design, workspace-migrations, workspace-permission; `pnpm exec turbo run test --dry | grep -ci turso` printed `0`.
- [x] `@libsql/client` is gone from the lockfile if nothing else uses it (criterion 16). Verified: after integrating over ticket 04's lockfile and `pnpm install`, `grep -n @libsql/client pnpm-lock.yaml` finds only drizzle-orm's own optional peer declarations (lines 1926, 1959), no resolved package; `pnpm install --frozen-lockfile` exit 0.
- [x] [[contexts/repository]] records that the package was removed and why, in one sentence. Verified: `.aep/contexts/repository.md` lines 28 to 31 record that the package was removed with effort 840 (requirement 16) because nothing in the desktop imported it: replication and the Platform API run in the Rust crate against the owner's own Turso account. Gate in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, cargo fmt 0, `cargo test --lib` 636 passed, validate 0.

## Relevant areas

- `packages/turso-platform/`, `turbo.json`, `tauri/build.rs` (comments only)
- `.aep/contexts/repository.md`, `.aep/rules/module-layout.md`, `.aep/rules/testing.md`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- `build.rs` logic is unchanged; only comments naming the package change.
