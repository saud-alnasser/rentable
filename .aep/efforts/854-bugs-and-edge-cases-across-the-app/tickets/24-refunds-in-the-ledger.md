---
status: open
blocked-by: [22]
---

# feat(desktop): refunds are recorded from the ledger and locked rows explain themselves

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Permissions, UI, history, i18n*).

## Outcome

A member who may record payments records, edits and deletes a refund from a contract's payments; refunds read as money going out; the form shows the most that may be refunded (and why when nothing may); locked payments on a terminated contract say why and how to change them; history and toasts name refunds.

## Acceptance Criteria

Traces requirements 25 and 26, and criteria 25 and 26.

- [ ] The "record refund" act with its unavailability reason; refund rows tagged and signed; month headers state received and returned.
- [ ] The form's direction prop and limit hint; locked rows carry the note.
- [ ] Payment page and palette show the direction; history freezes a refund's name; i18n in both languages.
- [ ] Component and history tests per criteria 25 and 26 (the interface half), including the three limit hints.

## Relevant areas

- `apps/desktop/src/lib/payment/{acts.ts,ledger.ts,query.ts,component/*}`
- `apps/desktop/src/lib/payment/i18n/{en,ar}.ts`

## Constraints

- Read [[contexts/desktop/components]] before choosing a component ([[rules/interface]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
