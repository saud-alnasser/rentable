---
status: open
---

# fix(i18n): figures use Western digits in both locales

## Outcome

Money, counts, dates and relative times format with Western digits in Arabic as in English. The
calendar receives the reader's locale. A search typed in Arabic-Indic digits still matches.

## Acceptance Criteria

Traces requirement 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 22(b).

- [ ] `platform/locale.ts` maps `ar` to `ar-SA-u-nu-latn`. Every `Intl` and `DateFormatter`
      construction goes through `getIntlLocale`, including `history/component/record-history.svelte`
      and the calendar captions, which receive the locale instead of defaulting to `en-US`.
- [ ] Tests asserting Arabic-Indic output are rewritten to Western: `i18n/tests/formatters.test.ts`,
      `platform/tests/locale.test.ts`, `platform/database/tests/search.test.ts:84-95`,
      `organization/tests/standing.svelte.test.ts:136`, `payment/tests/ledger.test.ts`. The tests
      proving Arabic-Indic input still matches (`search.test.ts` `52-55`, `102-126`;
      `layout/tests/palette.test.ts:213`) stay green unchanged.
- [ ] `i18n/formatters.ts`'s comment about Arabic-Indic numerals is corrected, and
      `[[rules/frontend]]` *i18n* records the digits decision.

## Relevant areas

- `apps/desktop/src/lib/platform/locale.ts`, `i18n/formatters.ts`, `contract/component/form.svelte:164`,
  `payment/component/form.svelte:63`, `history/component/record-history.svelte:69`,
  `packages/design/src/lib/primitive/calendar/*`

## Notes

This reverses effort 810's reading of the reader's digits, by the human's decision of 2026-09-24.
