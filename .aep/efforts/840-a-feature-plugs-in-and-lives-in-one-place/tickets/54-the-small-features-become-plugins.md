---
status: resolved
blocked-by: [53]
---
# refactor(tauri): database, print, update, transfer and startup become plugins

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The five become plugins the same way; `export.rs` and `import.rs` become `transfer/`. The two hot database commands keep their shape behind `plugin:database|`.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [x] Each is a plugin with a derived list; `lib.rs` names none of their commands (criterion 9). Verified: `database`, `print`, `update`, `transfer` and `startup` each have a `plugin.rs` whose list `build.rs` derives; a search of `lib.rs` for their command names finds only the five `.plugin(x::plugin())` lines and `use crate::update::Update`; a search of the frontend's invoke strings finds none of the old names (`db_execute_*`, `print_page`, `update_prepare`, `bootstrap`, `export_*`, `import_*`), now `plugin:database|execute_single_sql` and the like; `guard::acl` expects all eight plugins.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo build` finished, `cargo test --lib` `645 passed; 0 failed; 11 ignored`, check 0, eslint 0, vitest 0 (run on its own), build:web 0, validate 0; node tests fail only the date-dependent receipt test. No assertion changed; four cycle-baseline lines name `startup` for `bootstrap`. Running-app checks (startup to ready, a print, an export and import, an update) are held for the human at the close.

## Relevant areas

- `tauri/src/{database,print,update,export,import,bootstrap}`, `src/lib/platform/database/client.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
