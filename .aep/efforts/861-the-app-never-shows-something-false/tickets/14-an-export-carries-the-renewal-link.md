---
status: open
blocked-by: [09, 12]
---

# feat(desktop): an export carries the renewal link

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Technical Approach, step 11; Interfaces, Transfer file*).

## Outcome

The contracts sheet writes a `Renews` column naming the predecessor by its reference, an import resolves it softly at write, and the import runs recognition once at its end.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (export and import).

- [ ] A workspace exported and imported keeps every link, including a successor and predecessor in the same sheet.
- [ ] A `Renews` reference that resolves to nothing writes no link and refuses no row; a file with no `Renews` column imports as before.
- [ ] An import of an unlinked renewal that matches the rule is linked by the end of the import.

## Relevant areas

- apps/desktop/src/lib/contract/transfer.ts, transfer/transfer.ts, transfer/reference.ts, contract/router.ts (the import write)
- apps/desktop/src/lib/contract/renewal/recognize.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- `Renews` is not in the sheet's `references`, which would drop a row and which the planning pass caches per sheet.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
