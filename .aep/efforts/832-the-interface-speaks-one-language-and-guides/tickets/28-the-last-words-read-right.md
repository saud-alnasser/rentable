---
status: open
---

# docs(i18n): counts, create labels and titles read right in both locales

## Outcome

Counts read as real plurals in English ("1 member", "103 contracts"), as Arabic already does. A
create act names what it makes rather than "new record". No text transform changes what a person
typed or what the words are: a workspace named "default" stays "default", and "and" is never
capitalised. Headings follow one case across settings. A period is written with one dash in every
place, and "ID" is written as a person reads it.

## Acceptance Criteria

Traces requirements 13 and 17 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 13 and 17. Found by the walk of ticket 27 (findings 1, 9, 11 and 14).

- [ ] Every count string in `en` uses typesafe-i18n's plural form, so no visible English string
      contains "(s)". A node test fails on "(s)" in the English locale.
- [ ] The empty state's create act names the concept ("new contract", "new payment", in both
      locales), never "new record". Component test on a list's empty state.
- [ ] No `capitalize` or title-case transform sits on a heading that renders a user's value or a
      sentence; settings headings follow one case in every section. A lint test fails on
      `capitalize` outside an allowlist, with a reason for each entry.
- [ ] A date range reads with the en dash everywhere (record header and lists), through one
      formatter. "National ID" and "Government ID" in English.

## Relevant areas

- `apps/desktop/src/lib/i18n/en/index.ts`, `i18n/ar/index.ts` (regenerate types)
- `design/block/list.svelte` and `list-toolbar.svelte` (the count), the workspace switcher,
  `block/empty.svelte` callers
- `settings/component/area.svelte` and the settings sections, `packages/design/src/lib/block/record-surface.svelte`

## Constraints

- Lower case, as the locale files are. Arabic is rewritten, not transliterated.
