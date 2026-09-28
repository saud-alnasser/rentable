---
status: open
blocked-by: [01]
---
# chore: the turso-platform package is removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`packages/turso-platform` leaves the workspace, and every reference to it goes: `turbo.json`, `pnpm-workspace.yaml` if it names it, the lockfile, `tauri/build.rs`'s comments, and the `.aep/` rules and contexts that describe it ([[contexts/repository]], [[rules/module-layout]], [[rules/testing]]).

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [ ] The directory is gone and `turbo run test --dry` lists no `turso-platform` task (criterion 16).
- [ ] `@libsql/client` is gone from the lockfile if nothing else uses it (criterion 16).
- [ ] [[contexts/repository]] records that the package was removed and why, in one sentence.

## Relevant areas

- `packages/turso-platform/`, `turbo.json`, `tauri/build.rs` (comments only)
- `.aep/contexts/repository.md`, `.aep/rules/module-layout.md`, `.aep/rules/testing.md`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- `build.rs` logic is unchanged; only comments naming the package change.
