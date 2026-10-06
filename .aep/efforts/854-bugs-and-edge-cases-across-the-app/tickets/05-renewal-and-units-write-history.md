---
status: resolved
blocked-by: [04]
---

# fix(desktop): renewing a contract and changing its units write history

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R23*).

## Outcome

Renewing a contract records `renewed` on the predecessor and the successor, and changing a contract's units records `assigned`, the same as every other write.

## Acceptance Criteria

Traces requirement 23 and criterion 23.

- [x] `useRenewContract` writes `renewed` on both contracts; its undo writes `deleted` on the successor.
- [x] `useSetContractUnits` captures the contract and writes `assigned`, and its inverse records too.
- [x] A history test renews a contract and changes its units and finds `renewed` and `assigned`.

## Relevant areas

- `apps/desktop/src/lib/contract/{query.ts,renewal/query.ts}`
- `apps/desktop/src/lib/history/history.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
