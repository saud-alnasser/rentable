---
status: resolved
blocked-by: [43]
---

# feat(desktop): a roles card says what the role can do

## Outcome

A roles card today lists each family's flags in prose, with no icons. After this it sums the role
per kind of record, with the kind's icon and one plain word for the level (full access, can edit,
can add, view only), the owner as everything, and a short administration line where the role has
any, in the same words the switch list's folded groups use, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Permissions as
switches*, gives it.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The card shows each kind the role can see with its icon and level word, the kinds it cannot
      see left out, holders and rank as today.
- [x] Owner reads everything; the administration line counts what the role holds.
- [x] One helper gives the level word, used by the card and the switch list's folded groups.
      *The switch list folds only administration, so what the two share is its count and words.*
- [x] Component tests in English and Arabic; `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/component/` (roles block), `src/lib/i18n`
