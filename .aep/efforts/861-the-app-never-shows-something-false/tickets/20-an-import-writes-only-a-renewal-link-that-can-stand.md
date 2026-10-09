---
status: resolved
---

# fix(desktop): an import writes only a renewal link that can stand

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 5; requirement 7: a renewed contract is renewed once), and ticket 14. Found at review round 1 (correctness).

## Outcome

A workspace file's `Renews` value writes a link only where the renewal can stand: the predecessor ends before the successor starts, and no other standing successor, already held or earlier in the same file, renews it. Any other value writes no link and refuses no row, as an unresolved one does, so a hand-edited file cannot make two contracts renew each other or give one contract two successors.

## Acceptance Criteria

Traces requirement 5, requirement 7 and criterion 5 (export and import).

- [x] Rows A renews B and B renews A in one file import with at most the one link the dates allow, and no cycle; a router test covers it. Verified: a router test in `transfer/tests/router.test.ts` imports the pair in both row orders and finds only the link the dates allow; it failed before the fix with both links written.
- [x] A `Renews` naming a contract a standing successor already renews, held or earlier in the file, writes no link and refuses no row; a router test covers both. Verified: two router tests, one with the successor earlier in the file and one held in the workspace, write no second link and refuse no row; both failed before the fix.
- [x] A `Renews` naming a contract that ends on or after the successor's start writes no link; the round trip of ticket 14 still keeps every link. Verified: two router tests, in the file and held, write no link (they fail with the dates check turned off); `node --test` over the transfer node tests and `contract/renewal/tests`: all pass, ticket 14's round trip among them.

## Relevant areas

- apps/desktop/src/lib/contract/transfer.ts (the `Renews` write), contract/renewal/renewal.ts (`doesRenewalFollowPredecessor`, `getRenewedContractIds`)
- apps/desktop/src/lib/transfer/tests/router.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- Reuse the renewal module's rules rather than restating them in the import.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
