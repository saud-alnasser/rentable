---
status: open
blocked-by: []
---

# fix(desktop): a workspace that is not open exports its units' derived status

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap C. Ticket 12 made a contract's status derived at read for a workspace that is not open; the unit sheet still exports the stored status, which can be stale in the same way. The unit sheet derives through `unitStatuses` when the workspace is not open, as the contract sheet does.

## Acceptance Criteria

Traces requirement 15 and criterion 15.

- [ ] `transfer/tests/router.test.ts`: a unit whose stored status is stale in a workspace that is not open exports its derived status; the open workspace's export is unchanged.

## Relevant areas

- `apps/desktop/src/lib/complex/unit/transfer.ts`, `apps/desktop/src/lib/transfer/`

## Constraints

- No schema change.
