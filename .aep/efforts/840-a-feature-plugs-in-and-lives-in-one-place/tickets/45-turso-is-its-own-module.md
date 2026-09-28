---
status: resolved
blocked-by: [02]
---
# refactor(tauri): Turso is a module of its own

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`sync/turso/*` and `sync/oauth/*` become the top-level `turso/` module; `database` and `organization` import it rather than `sync` internals. The side error enums stay until the error ticket.

## Acceptance Criteria

Traces requirement 11 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 11.

- [x] `organization` and `database` import nothing from `sync::turso` (criterion 11). Verified: `grep -rn "sync::turso|sync::oauth" apps/desktop/tauri/src` finds only the cycle guard's own synthetic fixture in `guard/cycle.rs`; `src/organization` and `src/database` have no hit. `cycle.baseline.txt` has no `forbidden organization` line, and five cycle lines left with it (backup and database named `sync` only to reach Turso). `discovery::organization` moved to `sync::consented_organization`, beside the record it writes, so `turso` imports no `sync`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `633 passed; 0 failed; 11 ignored`, check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0. The one assertion change is the consent test's expected source path, now `src/turso/consent.rs`.

## Relevant areas

- `tauri/src/sync/turso/`, `tauri/src/sync/oauth/`, `database/mod.rs:23`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
