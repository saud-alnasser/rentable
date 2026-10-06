---
status: resolved
---

# fix(desktop): phone, national id, amount and cost accept Arabic-Indic digits

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R21*).

## Outcome

Arabic-Indic digits and the Arabic decimal separator typed or pasted into phone, national id, payment amount and contract cost are read as the Western digits they stand for, never erased or refused.

## Acceptance Criteria

Traces requirement 21 and criterion 21.

- [x] One table and `toWesternDigits` in `platform/locale.ts`; search imports the table from there.
- [x] The four fields fold at validation and submit; router schemas are unchanged.
- [x] Tests per criterion 21 in the tenant, payment and contract form tests and a locale unit test.

## Relevant areas

- `apps/desktop/src/lib/platform/{locale.ts,database/search.ts}`
- `apps/desktop/src/lib/tenant/component/form.svelte`
- `apps/desktop/src/lib/payment/component/form.svelte`
- `apps/desktop/src/lib/contract/form.ts`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
