---
status: resolved
blocked-by: [01]
---

# feat(contract): a contract shows its schedule

## Outcome

The contract record has a *schedule* section after *payments*: one row per cycle with its due date,
amount, covered amount and state, read through a new `contract.schedule` procedure.

## Acceptance Criteria

Traces requirements 5 and 6 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and
its criteria 5 and 6.

- [x] `contract.schedule({ id })` returns ticket 01's cycles for the contract and all its payments
      (router test through the real caller: criterion 5's contract, and the first case of 6(b)).
- [x] `schedule` is a section in `contract/section.ts` after `payments`, reached by
      `?section=schedule` (section test updated).
- [x] Each row shows the due date, the amount due, the amount covered, and the state as an icon with
      an accessible name; a late row with a partial cover states the part (component test).
- [x] A terminated contract's schedule shows no late and no due row (criterion 6(c), component test).
- [x] It works in both locales and both appearances; the i18n suites pass.

## Relevant areas

- `apps/desktop/src/lib/contract/router.ts`, `query.ts`, `section.ts`, `component/details.svelte`
  (collections)
- `apps/desktop/src/lib/payment/component/ledger.svelte` (the cells a money row uses)

## Constraints

- [[rules/interface]], *Record surface*, *Switching sections*, *Status presentation*.
- The pane reads the procedure and never allocates over rows it loaded ([[rules/data]]).
