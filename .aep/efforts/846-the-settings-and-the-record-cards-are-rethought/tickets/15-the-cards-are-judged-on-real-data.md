---
status: open
blocked-by: [14]
---

# chore(desktop): the four cards are judged on real data

Blocked by: 14

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

A prototype of the tenant, complex, unit and contract tiles, drawn on the development workspace's real records through the live queries, in Arabic and English, light and dark, at the widths that give one, two and three columns, fixes each concept's `recordHeight` and what each card holds. The finding is recorded as evidence and the heights in the plan are corrected.

## Acceptance Criteria

Traces requirements 18 and 19, and criterion 19.

- [ ] `evidence/prototypes/the-cards-on-real-data.md` records each card's content and height, with screenshots in both languages and appearances.
- [ ] The plan's grid table carries the heights the prototype fixed.
- [ ] The prototype code is deleted, not promoted.

## Relevant areas

- `apps/desktop/src/lib/prototype/`
- `.aep/efforts/846-the-settings-and-the-record-cards-are-rethought/`

## Constraints

- Real query data, never mock data, on the workspace switcher.
- Read [[rules/interface]]'s *The visual reference* and open the book where it routes, for card hierarchy and balance.
