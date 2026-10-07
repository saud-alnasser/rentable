---
status: resolved
blocked-by: [09, 10, 22]
---

# feat(desktop): export then import gives back the same state

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Transfer*, and Part one, *R5*, *R7*).

## Outcome

Exporting a workspace and importing it into an empty one gives back every record and every field a person entered, refunds and terminated contracts included; files exported before this effort still import with every payment received.

## Acceptance Criteria

Traces requirement 30 and criterion 30.

- [x] The payments sheet exports refunds as negative amounts and gains optional `Method`, `Reference` and `Note` columns with Arabic headers; the ledger export follows.
- [x] Import enforces refunded within received per contract.
- [x] `transfer/tests/round-trip.test.ts` per criterion 30, compared field by field; the existing fixtures still import.

## Relevant areas

- `apps/desktop/src/lib/payment/{transfer.ts,component/ledger.svelte}`
- `apps/desktop/src/lib/transfer/`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
