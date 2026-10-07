---
status: resolved
blocked-by: [09]
---

# fix(desktop): every contract has a reference only it answers to

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R7*).

## Outcome

Two numberless contracts of one tenant starting the same day export with distinct references and import whole with each payment on its own contract; a reference that resolved uniquely before resolves the same way; an ambiguous reference is refused, never resolved silently.

## Acceptance Criteria

Traces requirement 7 and criterion 7.

- [x] `toContractReferences` in `transfer/reference.ts` (bare, then `..end`, then ` #n` by id); every place that composes a contract reference uses it; the fallback pattern accepts all three shapes and `toGovIdFromReference` rejects them.
- [x] Resolution refuses a key two records answer to with `workspace.ambiguousReference`.
- [x] The Rust upgrade composer (`tauri/src/upgrade/record.rs`) applies the same rule, with a Rust test.
- [x] Tests per criterion 7; the existing `export.json` and `workbook.json` fixtures still import.

## Relevant areas

- `apps/desktop/src/lib/transfer/{reference.ts,router.ts}`
- `apps/desktop/src/lib/{contract,payment}/transfer.ts`
- `apps/desktop/tauri/src/upgrade/record.rs`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
