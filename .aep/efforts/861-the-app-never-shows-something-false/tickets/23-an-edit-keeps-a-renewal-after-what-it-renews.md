---
status: resolved
---

# fix(desktop): an edit keeps a renewal after the contract it renews

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 5: the link survives a workspace export and import), and tickets 11 and 20. Found at review round 2 (correctness).

## Outcome

An edit cannot make a renewal start on or before the end of the contract it renews, from either side: moving a successor's start back, or a predecessor's end forward past a standing successor's start, is refused with `contract.renewalBeforeEnd`, as renewing is. So every link held can stand, and an export and import keeps it.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (export and import).

- [x] `contract.update` refuses, with `contract.renewalBeforeEnd`, an edit that moves a successor's start on or before its predecessor's end, and one that moves a predecessor's end on or after a standing successor's start; an edit that keeps the order goes through; router tests cover each. Verified: `node --test` over `contract/tests/router.test.ts`, `contract/renewal/tests` and `api/tests/undo.test.ts`: 158 pass, 0 fail; refused for a successor moved onto and before its predecessor's end and a predecessor moved onto and past its successor's start, allowed for edits keeping the order and past a deleted, terminated or retired renewal; restoring a terminated renewal is held to the same order and to `contract.alreadyRenewed`.
- [x] The rule is `ensureRenewalFollowsPredecessor` from the renewal module, not restated. Verified: `update` and `unterminate` import `ensureRenewalFollowsPredecessor` (and `ensureNotRenewed`) from `contract/renewal/renewal.ts`; no date comparison is written in the router.
- [x] The refusal is worded for an edit in both locales if the renewal's wording does not read for one. Verified: reworded in both locales to read for an edit from either side and for renewing; a router test reads it in Arabic and English for both moves.

## Relevant areas

- apps/desktop/src/lib/contract/router.ts (`update`), contract/renewal/renewal.ts, contract/tests/router.test.ts, contract/i18n/

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
