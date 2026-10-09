---
status: resolved
blocked-by: [09, 11]
---

# fix(desktop): a renewed contract is not up for renewal

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `contract/row.ts`, `contract/rank/rank.ts`, the three reads, `contract/acts.ts`*).

## Outcome

A contract that a non-terminated successor names is read as renewed by the contract read, the directory and the dashboard; it ranks as ending soon nowhere and is not offered *renew*; deleting or terminating its successor puts it back.

## Acceptance Criteria

Traces requirement 7 and criterion 7.

- [x] `renewedColumn` in `contract/row.ts` is the one SQL expression; `contract.get` and `directory.list` select it, and the dashboard builds the same fact from the rows it reads. Verified: the diff selects `renewedColumn` in `contract.get` and `getMany`, and the dashboard builds the set from the `renewsContractId` of its non-terminated rows; the three router test files pass in the run below.
- [x] `isContractEndingSoon`, `getContractRank` and `getContractRankBounds` exclude a renewed contract from ending soon; `rank/tests` cover it. Verified: `node --test` over `contract/rank/tests`, `contract/tests/router.test.ts`, `contract/directory/tests` and `dashboard/tests/router.test.ts`: 169 pass, 0 fail, with renewed cases in `rank.test.ts` and the bounds sweep run with and without `renewed`.
- [x] Directory, `get` and dashboard router tests: a renewed contract inside its window is in no ending-soon list; after its successor is deleted, and separately terminated, it is again; a retired successor does not count. Verified: the same run: a renewed contract in its window is in no ending-soon list, is back after its successor is deleted and, separately, terminated, and a retired successor does not count.
- [x] `contract.renew` has `appliesTo: (contract) => !contract.renewed`; an acts test covers it. Verified: `acts.ts` line 141 reads `appliesTo: (contract) => !contract.renewed`; `node --test src/lib/act/tests/act.test.ts`: 98 pass, 0 fail, including `renewing is offered on a contract nothing renews, and on no renewed one`.
- [x] [[contexts/desktop/contract]], under *Ending soon*, excludes a renewed contract. Verified: `.aep/contexts/desktop/contract.md` gains a *Renewed* entry and *Ending soon* excludes a renewed contract.

## Relevant areas

- apps/desktop/src/lib/contract/row.ts, contract/rank/rank.ts, contract/serialize.ts, contract/acts.ts
- apps/desktop/src/lib/contract/router.ts (`get`), contract/directory/router.ts, dashboard/router.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- *Renewed* is read, never stored ([[contexts/repository]], *Reconciliation owns the derived columns*).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
