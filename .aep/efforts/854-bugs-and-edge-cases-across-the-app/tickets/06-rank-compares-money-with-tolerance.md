---
status: open
---

# fix(desktop): a contract paid in full never ranks owing or overdue

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R3*).

## Outcome

A contract's rank compares money with the tolerance the rest of the domain uses, so a contract paid in full never ranks owing or overdue, never shows in those filters, and is never offered a reminder.

## Acceptance Criteria

Traces requirement 3 and criterion 3.

- [ ] `rank.ts` uses `hasSatisfiedContractPaymentRequirement`; the directory's SQL bound stays, with a comment saying why.
- [ ] A unit test ranks 12 x 4166.67 with twelve such payments as neither owing nor overdue, inside and past the term; a directory router test excludes it from both filters; `contract.reminder` refuses it.

## Relevant areas

- `apps/desktop/src/lib/contract/rank/rank.ts`
- `apps/desktop/src/lib/contract/directory/router.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
