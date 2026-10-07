---
status: resolved
---

# fix(desktop): undoing a refund's change puts back what was recorded

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 2 (2026-10-07) and decided by the human the same day.

## Outcome

Undo takes a mistaken change back to the state before it, so undoing the edit or deletion of a refund restores exactly the amount that was recorded, even on a contract (a restored one) that already holds refunds past its live limit; refunds still never exceed what the contract received. Recording a new refund, or raising one by hand, stays held to the limit by state.

## Acceptance Criteria

Traces requirements 25 and 26, and criteria 25 and 26.

- [x] A write that an undo or redo replays (a single payment's edit or deletion taken back, and `payments.createMany` restoring a bulk deletion) is checked only that refunds stay within what the contract received; a write a person makes by hand keeps the limit by state, and nothing else about permissions or the terminated lock changes.
- [x] Router and undo tests on a restored contract (received 5,000, terminated, refunded 3,000, restored): lowering the refund to 2,000 then undoing restores 3,000; deleting it then undoing brings it back; a new refund or raising one by hand is still refused above the limit; an undo that would take refunds past what was received is still refused.
- [x] [[contexts/desktop/contract]]'s Refund entry states the rule and why, in the human's terms: an intended change is reversed by another change, an unintended one is undone back to the state before it.

## Relevant areas

- `apps/desktop/src/lib/payment/{payment.ts,router.ts,query.ts}`
- `apps/desktop/src/lib/payment/selection/router.ts`
- `apps/desktop/src/lib/undo/`
- `apps/desktop/src/lib/api/tests/undo.test.ts`

## Constraints

- The human's ruling, verbatim: "my goal is once an actual intended change is done; it's undone by a new intened change; if a change is not intended then it can be mofified or deleted and gone to the prevous state; but if it's intened and part of the history then must undo it only by another change".
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset only where a user observes something no entry of this effort already says; otherwise say so in Notes ([[references/changesets]]).
