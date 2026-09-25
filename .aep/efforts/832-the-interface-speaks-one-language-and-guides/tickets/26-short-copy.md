---
status: resolved
blocked-by: [21, 23, 25]
---

# docs(i18n): the words are short and plain

## Outcome

Visible text is short and plain in both locales. An explanation the interface cannot make obvious
sits behind a disclosure or in a tooltip. Only confirmations of irreversible acts carry a full
sentence of consequence. The currency is no longer written into a sentence.

## Acceptance Criteria

Traces requirement 17 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 17.

- [x] A node test fails on any English string over 120 characters outside a listed set of
      irreversible-confirmation keys. Verified: `i18n/tests/length.test.ts` fails on any English string over 120 characters outside one listed irreversible confirmation (`layout.signIn.disconnectDescription`); it failed on the prior locale files and passes on the merged tree (desktop node 1161 of 1161).
- [x] The 26 long strings in the evidence inventory are cut or moved behind a disclosure, and the
      Arabic follows. Verified: today's recount found 41 English strings over 120 characters (22 over 160; the inventory's 26 counted over 160); all are cut to one or two short sentences with Arabic rewritten, 42 keys in both locales; a recount finds none left.
- [x] `contracts.payments.remaining` no longer embeds "sar". The money cell carries the sign.
 Verified: `contracts.payments.remaining` is `'{amount:string} remaining'` and `'متبقٍ {amount}'`; the test fails on 'sar' or 'ريال'.
## Relevant areas

- `apps/desktop/src/lib/i18n/en/index.ts`, `i18n/ar/index.ts` (regenerate the types after editing;
  see `[[references/pnpm]]`)

## Constraints

- Lower case, as the locale files already are. Arabic is rewritten, not transliterated from the
  English.
