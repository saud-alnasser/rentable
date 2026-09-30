---
status: resolved
blocked-by: [60]
---
# test: file and directory names are checked

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

One test per language holds the tree to [[rules/module-layout]]: one-word Rust file names, no `<x>.rs` beside `<x>/`, no `utils`, `common`, `mod.ts`, singular directories but `tests/`. Current offenders are a baseline that only shrinks.

## Acceptance Criteria

Traces requirement 14 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 14.

- [x] Both tests pass with a baseline (criterion 14); `database/commands.rs` is in it. Verified: `cargo test --lib guard` printed `test result: ok. 5 passed; 0 failed`; `pnpm test` in apps/desktop printed `tests 1397 / pass 1397 / fail 0` and Vitest `606 passed`. `tauri/src/guard/naming.baseline.txt` holds `database/commands.rs: plural`, `diagnostics/: plural`, `settings.rs: plural`; `src/tests/naming.baseline.txt` holds three lines (`lib/settings/`, `chart-utils.ts`, `primitive/tabs/`).
- [x] A scratch file named `helper_util.rs` fails the Rust one (criterion 14). Verified: with `src/helper_util.rs` created, `cargo test --lib guard::naming::tests::every` printed `"helper_util.rs: not one word"` and `test result: FAILED. 0 passed; 1 failed`; file removed.

## Relevant areas

- `src/lib/`, `tauri/src/`, `packages/design/src/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
