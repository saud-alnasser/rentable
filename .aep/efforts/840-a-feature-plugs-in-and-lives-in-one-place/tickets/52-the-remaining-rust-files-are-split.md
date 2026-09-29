---
status: resolved
blocked-by: [51]
---
# refactor(tauri): the remaining oversized Rust files are split

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every Rust source file still over 1,000 production lines is split along its concerns (at least `authority.rs`, `role`, `invitation`, `turso/platform.rs` with its live and fake adapters apart, `schema.rs`, `discovery.rs`), and `database/commands.rs` is `command.rs`.

## Acceptance Criteria

Traces requirements 14 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 14 and 17.

- [x] No Rust production file passes 1,000 lines, or it is named in [[rules/module-layout]] with why (criterion 17). Verified: a production-line count of every `.rs` under `tauri/src` outside `test/` directories (lines before a `#[cfg(test)]` followed by `mod tests`) finds no file over 1,000; the largest is `organization/ownership/mod.rs` at 871. Eleven files were split, among them `role/` (ownership logic now in `ownership/`), `invitation/`, `authority/`, `session/`, `setup/`, `turso/platform/` (live and memory adapters apart), `upgrade/format/{two,runner}/`, `schema/` and `turso/discovery/`.
- [x] The Rust naming baseline is empty (criterion 14). Verified: `tauri/src/guard/naming.baseline.txt` holds no offence line; `database/commands.rs` is `command.rs`, and the guard's `UNCOUNTABLE` list (`diagnostics`, `settings`) matches the same list in `rules/module-layout` with the reason for each.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after repointing `organization/setup/tests/setup.test.ts`'s Rust path one directory deeper (moved there by ticket 37): `cargo fmt --check` 0, `cargo test --lib` `642 passed; 0 failed; 11 ignored`, clippy at its seven pre-existing warnings, check 0, eslint 0, build:web 0, validate 0; `pnpm test` fails only the date-dependent receipt test that fails at the tip without this ticket. The child hashed every test body before and after: none missing or new, 22 differ only in a moved path or visibility.

## Relevant areas

- `tauri/src/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
