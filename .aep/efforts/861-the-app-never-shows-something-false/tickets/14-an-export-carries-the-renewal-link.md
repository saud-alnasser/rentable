---
status: resolved
blocked-by: [09, 12]
---

# feat(desktop): an export carries the renewal link

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Technical Approach, step 11; Interfaces, Transfer file*).

## Outcome

The contracts sheet writes a `Renews` column naming the predecessor by its reference, an import resolves it softly at write, and the import runs recognition once at its end.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (export and import).

- [x] A workspace exported and imported keeps every link, including a successor and predecessor in the same sheet. Verified: `node --test src/lib/transfer/tests/*.test.ts` in the child: 116 node tests pass (the one failure is `collisions.svelte.test.ts`, a vitest file the glob swept in); `transfer/tests/router.test.ts` round-trips a chain of three contracts with their rows reversed, each holding a different unit so recognition cannot stand in, and compares the links and the re-export.
- [x] A `Renews` reference that resolves to nothing writes no link and refuses no row; a file with no `Renews` column imports as before. Verified: the same run: a `GOV-404` reference leaves nothing unresolved or rejected, imports all 3 contracts and writes no link; a file without the column imports as before, and the older-file tests still pass.
- [x] An import of an unlinked renewal that matches the rule is linked by the end of the import. Verified: the same run: same tenant, same unit, next-day start and no `Renews` value, linked once `importWhole` returns, through `linkRecognizedRenewals` in the contracts sheet's `settle`.

## Relevant areas

- apps/desktop/src/lib/contract/transfer.ts, transfer/transfer.ts, transfer/reference.ts, contract/router.ts (the import write)
- apps/desktop/src/lib/contract/renewal/recognize.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- `Renews` is not in the sheet's `references`, which would drop a row and which the planning pass caches per sheet.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
