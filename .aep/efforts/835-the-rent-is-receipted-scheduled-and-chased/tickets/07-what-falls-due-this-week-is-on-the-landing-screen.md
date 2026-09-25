---
status: open
blocked-by: [01]
---

# feat(contract): what falls due this week is on the landing screen

## Outcome

`due-soon` is a fourth attention rank, after *owing* and before *ending soon*. It is decided in the
contract domain from ticket 01's schedule, shown on the landing screen with the amount coming due,
and filterable wherever ranks filter.

## Acceptance Criteria

Traces requirement 11 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and its
criterion 11.

- [ ] `CONTRACT_RANKS` holds four ranks in that order; `isMoneyRank` is the explicit set of
      `overdue` and `owing`; `getContractRank` takes the contract and its paid amount
      ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Components*,
      `contract/rank.ts`).
- [ ] Cases 11(a) to 11(d) pass in `contract/tests/rank.test.ts`, and the bounds soundness sweep
      covers four ranks.
- [ ] The landing screen shows a due-soon section whose rows state the cycle's amount and due date,
      and the outstanding figure does not change because of it (dashboard router and component tests).
- [ ] `rank-filter.ts` offers *due soon* in the contracts, tenant and unit lists.
- [ ] Labels exist in both locales, and the Arabic label is not مستحق.

## Relevant areas

- `apps/desktop/src/lib/contract/rank.ts`, `rank-filter.ts`, `router.ts` (bounds, filter, the
  `getContractRank` call)
- `apps/desktop/src/lib/dashboard/router.ts`, `component/section.svelte`, `landing.svelte`

## Constraints

- [[rules/interface]], *Attention rank*, gains *due soon* in this commit, and
  [[contexts/desktop/contract]] gains the word.
- The dashboard never derives a rank.
