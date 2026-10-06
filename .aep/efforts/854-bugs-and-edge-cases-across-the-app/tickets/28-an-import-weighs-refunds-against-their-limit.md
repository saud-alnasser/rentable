---
status: obsolete
---

# fix(desktop): an imported refund is held to the same limit as one recorded by hand

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

A refund that arrives in a file is weighed against the limit requirement 26 sets for the contract's state, the state the file gives it, so an import never leaves a live contract owing because of a refund.

## Acceptance Criteria

Traces requirement 26 and criterion 26, and requirement 30.

- [ ] Workspace import refuses, naming the contract, a refund beyond `getRefundableAmount` for the contract as the file states it (live: surplus beyond the total cost less earlier refunds; terminated: received less refunds), counting held rows and the file's rows; a whole import's terminations, written last, are read as the file's status.
- [ ] Transfer router tests: a file refunding a live contract beyond its surplus is refused and writes nothing; the same refund on a contract the file states terminated goes through; `round-trip.test.ts` still passes.

## Relevant areas

- `apps/desktop/src/lib/payment/transfer.ts`
- `apps/desktop/src/lib/transfer/`
- `apps/desktop/src/lib/contract/contract.ts` (`getRefundableAmount`)

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.

## Notes

Obsolete (review round 1, 2026-10-07): built and then withdrawn. Weighing an imported refund against the limit by state refused a state the app reaches on its own (a refunded terminated contract restored, requirement 27), so an export of it could not be imported back (requirement 30). The limit governs recording a refund; import keeps ticket 26's check that refunds stay within what was received.
