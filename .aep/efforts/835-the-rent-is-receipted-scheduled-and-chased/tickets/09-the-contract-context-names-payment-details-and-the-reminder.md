---
status: resolved
blocked-by: [03, 08]
---

# docs(desktop): the contract context names payment details and the reminder

## Outcome

The contract context says what a payment now records beyond its date and amount, and names the
WhatsApp reminder, so the language a reader looks up matches what the effort built. Appended by
converge, round one.

## Acceptance Criteria

Traces requirements 1, 2 and 12 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]].

- [x] *Payment* in [[contexts/desktop/contract]] names the optional method (one of four), reference
      and note, and that the reference is what a payment is searched by (criteria 1, 2 and 3).
- [x] A *Reminder* entry says what it is, the three ranks it is offered on, that it opens WhatsApp
      with the message written, and that the application sends nothing and records nothing
      (criterion 12).
- [x] `node .aep/scripts/validate.mjs` exits zero.

## Relevant areas

- `.aep/contexts/desktop/contract.md`
