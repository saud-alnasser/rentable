---
status: resolved
blocked-by: [02]
---

# feat(payment): a payment says how it was paid

## Outcome

A payment carries an optional method, reference and note. All three are stored, set on the form and
shown on the record; the reference is searchable; and undo carries all three.

## Acceptance Criteria

Traces requirements 1, 2, 3 and 4 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]],
and its criteria 1, 2, 3 and 4(a).

- [x] The schema and migration `0005` add the three nullable columns
      ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Data Model*), generated
      and hand-finished per [[contexts/desktop/persistence]]; the `memory.ts` router tests pass on it.
- [x] The form offers the four methods as a toggle group with none chosen and a chosen one
      clearable, plus a reference input and a note textarea (criterion 1(a), component test).
- [x] Create and update round-trip all three through the real caller. A payment inserted without
      them reads null, opens, edits and saves, and its record says the method is not recorded
      (criteria 1(b), 1(c), 2(a), 2(b)).
- [x] `getMany` and `search` find a payment by a fragment of its reference, in both locales'
      foldings (criterion 3).
- [x] Editing the three and undoing restores them (criterion 4(a)); the edit enters history through
      ticket 02's declaration.
- [x] Labels exist in both locales; the i18n suites pass.

## Relevant areas

- `apps/desktop/src/lib/platform/database/schema.ts`, `packages/workspace-migrations/`
- `apps/desktop/src/lib/payment/router.ts` (`serializePayment`, `update`'s pick and `.set`,
  `PAYMENT_SEARCH_COLUMNS`)
- `apps/desktop/src/lib/payment/component/form.svelte`, `details.svelte`
- `apps/desktop/src/lib/contract/component/form.svelte` (the toggle group pattern)

## Constraints

- The columns are not added to `ASCII_ONLY_COLUMNS`.
- `workspace/router.ts`'s transfer keeps picking `{ date, amount }`
  ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Integration*).
- A changeset notes schema version 5 and what an older build does with it (plan, *Migration*).
