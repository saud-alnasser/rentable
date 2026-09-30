---
status: resolved
blocked-by: [21]
---
# refactor(desktop): import and export are a capability built from declarations

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/import.ts` and the whole-workspace transfer in `workspace/workspace.ts` and `workspace/router.ts` become `src/lib/transfer/`. Each record feature declares its `transfer` (sheet, columns, order, reader, writer) in `feature.ts`; `app/` hands the list to `transfer/`, which builds the importer, exporter and router from it. The sheets, columns and order stay exactly as they are, since `tauri/src/earlier.rs` reads them.

## Acceptance Criteria

Traces requirements 1, 2 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1, 2 and 20.

- [x] No per-kind transfer list remains in `workspace/` (criteria 1, 2 and 20). Verified: a search of `workspace/` (tests aside) for sheet, column or order declarations finds only a doc comment in `workspace/query.ts`; each record feature declares its sheet in its own `transfer.ts`, passed as `transfer` in its `feature.ts` (the units sheet in `complex/unit/feature.ts`), and `transfer/` builds the importer, exporter and router from the list `app/` hands it. The procedures moved from `workspace.*` to `transfer.*`.
- [x] A test round-trips a seeded workspace and compares the sheets and columns with an export taken before the change. Verified: `transfer/tests/workbook.test.ts` printed `a seeded workspace exports the workbook it always has` and `the workbook read back into an empty workspace exports the same workbook` (`pass 2`) against `workbook.json`, which the child generated from the unchanged code before the move and diffed unchanged after; import order stays tenants, complexes, units, contracts, payments.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, `cargo test --lib` `642 passed` (the Rust `include_str!` of `app-database.json` resolves), validate 0; assertions changed only for `workspace.*` becoming `transfer.*`.

## Relevant areas

- `src/lib/design/import.ts`, `src/lib/workspace/workspace.ts`, `src/lib/workspace/router.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
