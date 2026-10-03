---
status: resolved
blocked-by: [14]
---

# chore(desktop): the four cards are judged on real data

Blocked by: 14

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

A prototype of the tenant, complex, unit and contract tiles, drawn on the development workspace's real records through the live queries, in Arabic and English, light and dark, at the widths that give one, two and three columns, fixes each concept's `recordHeight` and what each card holds. The finding is recorded as evidence and the heights in the plan are corrected.

## Acceptance Criteria

Traces requirements 18 and 19, and criterion 19.

- [x] `evidence/prototypes/the-cards-on-real-data.md` records each card's content and height, with screenshots in both languages and appearances. *Verified: the commit adds `evidence/prototypes/the-cards-on-real-data.md` with 24 screenshots (three columns at 1300 in en and ar, light and dark; two at 1000 and one at 640 in en-light and ar-dark) plus the rejected unit tile, and the human's verdict on units verbatim; every capture measured each tile's natural height at the fixed value.*
- [x] The plan's grid table carries the heights the prototype fixed. *Verified: the commit's plan diff changes only the grid table's height cells: tenant 144, complex 120, contract 184, unit 64 staying a row.*
- [x] The prototype code is deleted, not promoted. *Verified: `ls apps/desktop/src/lib/prototype/` in the run tree lists only `switcher.svelte`, unchanged, and `git status --short` is empty; the commit carries no source file.*

## Relevant areas

- `apps/desktop/src/lib/prototype/`
- `.aep/efforts/846-the-settings-and-the-record-cards-are-rethought/`

## Constraints

- Real query data, never mock data, on the workspace switcher.
- Read [[rules/interface]]'s *The visual reference* and open the book where it routes, for card hierarchy and balance.
