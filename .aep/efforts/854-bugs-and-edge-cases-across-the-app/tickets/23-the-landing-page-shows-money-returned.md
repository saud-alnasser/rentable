---
status: open
blocked-by: [20]
---

# feat(desktop): the landing page shows money returned

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part three, *Dashboard (req 28)*).

## Outcome

Collected stays every payment received in the period, and a returned figure, the refunds dated in the period, appears beside it when it is not zero.

## Acceptance Criteria

Traces requirement 28 and criterion 28.

- [ ] `collected` counts received rows only; `returned` sums refunds; `money.returned` present only above zero; the landing shows it.
- [ ] Router and component tests per criterion 28.

## Relevant areas

- `apps/desktop/src/lib/dashboard/{router.ts,component/landing.svelte}`
- `apps/desktop/src/lib/dashboard/i18n/`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
