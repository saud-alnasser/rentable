---
status: resolved
blocked-by: [09]
---

# feat(desktop): reconcile links the renewals it did not record

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, The renewal link; Components, `contract/renewal/recognize.ts`, `contract/reconcile.ts`*).

## Outcome

A pure `recognizeRenewals` finds unlinked pairs by the rule in requirement 6, and the whole-table reconcile writes the links it finds in one batch, so renewals made before this change, by an older build, or imported without the link are linked.

## Acceptance Criteria

Traces requirement 6 and criterion 6.

- [x] `contract/renewal/tests/recognize.test.ts` covers a match, a different tenant, different units, a start not on the next UTC day, a terminated candidate, ambiguity on either side, an existing link left alone, and two contracts holding no units. Verified: `node --test recognize.test.ts router.test.ts version.test.ts`: 69 pass, 0 fail; `recognize.test.ts` has 15 tests over every listed case, with two contracts holding no units pairing on tenant and date, as spec requirement 6 and *Risks* say.
- [x] A router test seeds an unlinked pair, runs `contract.reconcile`, and finds the link; a second run changes nothing. Verified: the same run: `contract/tests/router.test.ts` seeds an unlinked pair, `contract.reconcile` links it, and a second run leaves the table identical and sends no contract update.
- [x] Reconcile on a build read-only by version writes no link. Verified: the same run: `api/tests/version.test.ts` reconciles below the write floor, writes no statement and leaves the link null; a caller that may write then links the same pair.
- [x] The Rust seed walk's version-9 workspace, opened at 10 and reconciled, shows its seeded renewal linked (or a TS test seeded at the same shape, where the walk does not reconcile). Verified: the TS form, since the seed walk never reconciles: a test inserts the seed's d0001, d0002 and d0003 (without its link) at version 10, reconciles, and finds d0003 naming d0001 and the other two naming nothing; it passes in the same run.

## Relevant areas

- apps/desktop/src/lib/contract/renewal/recognize.ts (new), contract/reconcile.ts, contract/router.ts (`reconcile`)
- apps/desktop/src/lib/startup/machine.ts, sync/workspace.ts, startup/reconcile.ts (callers, unchanged)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- Dates compare as whole UTC days, as every date in the domain does.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
