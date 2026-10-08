---
status: open
blocked-by: [09, 11]
---

# fix(desktop): a renewed contract is not up for renewal

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `contract/row.ts`, `contract/rank/rank.ts`, the three reads, `contract/acts.ts`*).

## Outcome

A contract that a non-terminated successor names is read as renewed by the contract read, the directory and the dashboard; it ranks as ending soon nowhere and is not offered *renew*; deleting or terminating its successor puts it back.

## Acceptance Criteria

Traces requirement 7 and criterion 7.

- [ ] `renewedColumn` in `contract/row.ts` is the one SQL expression; `contract.get` and `directory.list` select it, and the dashboard builds the same fact from the rows it reads.
- [ ] `isContractEndingSoon`, `getContractRank` and `getContractRankBounds` exclude a renewed contract from ending soon; `rank/tests` cover it.
- [ ] Directory, `get` and dashboard router tests: a renewed contract inside its window is in no ending-soon list; after its successor is deleted, and separately terminated, it is again; a retired successor does not count.
- [ ] `contract.renew` has `appliesTo: (contract) => !contract.renewed`; an acts test covers it.
- [ ] [[contexts/desktop/contract]], under *Ending soon*, excludes a renewed contract.

## Relevant areas

- apps/desktop/src/lib/contract/row.ts, contract/rank/rank.ts, contract/serialize.ts, contract/acts.ts
- apps/desktop/src/lib/contract/router.ts (`get`), contract/directory/router.ts, dashboard/router.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- *Renewed* is read, never stored ([[contexts/repository]], *Reconciliation owns the derived columns*).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
