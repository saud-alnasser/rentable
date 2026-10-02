---
status: resolved
blocked-by: []
---

# fix(desktop): a workspace that is not open exports its units' derived status

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap C. Ticket 12 made a contract's status derived at read for a workspace that is not open; the unit sheet still exports the stored status, which can be stale in the same way. The unit sheet derives through `unitStatuses` when the workspace is not open, as the contract sheet does.

## Acceptance Criteria

Traces requirement 15 and criterion 15.

- [x] `transfer/tests/router.test.ts`: a unit whose stored status is stale in a workspace that is not open exports its derived status; the open workspace's export is unchanged. *Verified: `node --test transfer/tests/router.test.ts` printed pass 24, fail 0; "a unit whose stored status went stale exports the status it derives now" (failing before the fix with A1 vacant, A2 occupied) exports south's A1 occupied and A2 vacant, leaves south's stored values stale, and north's open export keeps the stored value.*

## Relevant areas

- `apps/desktop/src/lib/complex/unit/transfer.ts`, `apps/desktop/src/lib/transfer/`

## Constraints

- No schema change.
