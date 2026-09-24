---
status: open
---

# fix(desktop): the last inconsistencies the walk and the catalogue found

## Outcome

A unit's status reads without colour, as every status does. A set with nothing in it shows no
count above its empty state. The payment record matches its siblings: its eyebrow, a breadcrumb
through its contract, and its unavailable acts shown disabled with their reason rather than
missing. Descriptions start the same way everywhere, and Turso is written one way. The workspace's
edit sheet is titled edit, export says why it cannot run, the ledger shows a refused import with its
reason, and a failed route offers retry as the caught error does.

## Acceptance Criteria

Traces requirements 6, 14, 16 and 17 of
[[efforts/832-the-interface-speaks-one-language-and-guides/spec]], and its criteria 6, 14 and 16.
Found by the second walk of ticket 27 (unit status, the count above an empty set, the payment
record, description casing) and by ticket 31's catalogue (the four acts that depart from their
sections).

- [ ] A unit's status, on its page and its rows, is drawn with a shape or glyph per status as
      the status cells are, never a bare coloured dot; the lock beside a payment's contract number
      carries its word. Component test.
- [ ] The toolbar hides its count while the set is empty and unfiltered. Component test.
- [ ] The payment record's eyebrow follows its siblings' convention, its breadcrumb runs through
      its contract, and its acts that do not apply render disabled with their reason. Component
      test.
- [ ] Every description in both locales starts in the same case, and Turso is written one way in
      both locales. A node test holds both.
- [ ] The workspace edit sheet is titled edit; export disabled on an empty set carries its reason;
      a locked ledger shows import refused with its reason; `+error.svelte` offers retry beside the
      way back. Each matches its section of `[[rules/interface]]`.

## Relevant areas

- `complex/component/unit-*`, `design/cell/*`, `design/block/list-toolbar.svelte`,
  `contract/component/payment-*` and the payment record route, `layout/navigation.ts`
- `apps/desktop/src/lib/i18n/en/index.ts`, `i18n/ar/index.ts`
- `organization/component/workspaces.svelte`, the export menu in the list shell,
  `payment/component/ledger.svelte`, `routes/+error.svelte`
