---
status: open
blocked-by: [09]
---

# feat(desktop): reconcile links the renewals it did not record

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, The renewal link; Components, `contract/renewal/recognize.ts`, `contract/reconcile.ts`*).

## Outcome

A pure `recognizeRenewals` finds unlinked pairs by the rule in requirement 6, and the whole-table reconcile writes the links it finds in one batch, so renewals made before this change, by an older build, or imported without the link are linked.

## Acceptance Criteria

Traces requirement 6 and criterion 6.

- [ ] `contract/renewal/tests/recognize.test.ts` covers a match, a different tenant, different units, a start not on the next UTC day, a terminated candidate, ambiguity on either side, an existing link left alone, and two contracts holding no units.
- [ ] A router test seeds an unlinked pair, runs `contract.reconcile`, and finds the link; a second run changes nothing.
- [ ] Reconcile on a build read-only by version writes no link.
- [ ] The Rust seed walk's version-9 workspace, opened at 10 and reconciled, shows its seeded renewal linked (or a TS test seeded at the same shape, where the walk does not reconcile).

## Relevant areas

- apps/desktop/src/lib/contract/renewal/recognize.ts (new), contract/reconcile.ts, contract/router.ts (`reconcile`)
- apps/desktop/src/lib/startup/machine.ts, sync/workspace.ts, startup/reconcile.ts (callers, unchanged)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- Dates compare as whole UTC days, as every date in the domain does.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
