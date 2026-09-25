---
status: resolved
---

# feat(contract): the reminder names the contract

## Outcome

The WhatsApp reminder names the contract by its number, or the tenant's contract where it has
none, instead of listing the units, so one message fits every contract.

## Acceptance Criteria

Traces requirement 12 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], as
revised on 2026-09-25, and criterion 12(b).

- [x] `contract.reminder` answers the contract's number and no unit names (criterion 12(b),
      `contract/tests/router.test.ts`, the three rank tests, pass).
- [x] In both languages the message names the tenant, the amount, the date and the contract, and a
      contract with no number is *your contract* (criterion 12(b), `contract/tests/reminder.test.ts`;
      node run of the reminder, router and i18n suites: pass 159, fail 0).
- [x] The panel shows and sends that message (`contract/tests/reminder.svelte.test.ts`, 5 passed).
