---
status: resolved
---

# fix(desktop): a record that is still loading says so about the record

## Outcome

A reader waiting on a record is told the record is on its way, in words that are about the
record, in both locales. The package's contract key and what the desktop supplies for it say
the same kind of thing, so a second consumer reading the docstring supplies the same kind of
sentence.

## Acceptance Criteria

Traces requirement 8 of the spec, and its criterion 8.

- [x] A record surface that is still loading renders a sentence about the record rather than
      about the application, in both locales. `common.messages.loadingRecord` is
      `loading record...` and `جاري تحميل السجل...`, added beside `loadingSettings` in both locale
      files and regenerated into `i18n-types.ts` with `pnpm i18n`.
- [x] The contract key and what the desktop supplies for it agree. `+layout.svelte:93` supplies
      `$LL.common.messages.loadingRecord()` where it supplied `loadingApp()`, and
      `DesignStrings.loadingRecord`'s docstring now says the sentence is about the record and not
      about the application, and why this key cannot name the record's kind. **`loadingApp` went
      with it**: this change was its only reader, and a grep over `apps/` returns it in the locale
      files alone.
- [x] The spec's Open Question is answered in the spec before this is built, not during it:
      whether the sentence is the contract's or the caller's. Answered under `# Open Questions`,
      by applying `[[rules/frontend]]`'s *who knows the words* test. It is a contract key.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. `check` reported `0 ERRORS 0 WARNINGS` for
      both projects and `All matched files use Prettier code style!`; `lint` printed the prettier
      line and nothing else; `test` reported `Tasks: 4 successful, 4 total`.

## Relevant areas

`packages/design/src/lib/block/record-surface.svelte` renders `contract.strings.loadingRecord`
beneath its spinner, and the contract documents that key as what a record surface says while
the record is still being read.

`apps/desktop/src/routes/+layout.svelte` supplies `$LL.common.messages.loadingApp()` for it,
which is `loading app...` and `جاري تحميل التطبيق...`.

`apps/desktop/src/lib/i18n/en/index.ts:576` already carries `loadingTenant: 'loading tenant...'`,
so at least one concept has the sentence this wants and does not use it.

## Constraints

- **Decide whether the sentence is the contract's or the caller's before writing either.**
  `record-surface` is shared by every concept, so one contract key cannot name the record's
  kind. A per-concept sentence is a prop; a sentence that works for any record is a key.
  `[[rules/frontend]]` under the packaged-component rules has the test.

## Notes

Not a regression. `record-surface.svelte` read the same key before #781 inverted it onto the
contract, so the words on screen are unchanged. What #781 changed is that the mismatch is now
written into the package's public contract, where it is a docstring saying one thing and the
only consumer supplying another. Found by the correctness axis reviewing #781, by comparing each
new key against what the block renders and against the locale file. Raised as #798.

This lands before ticket 04, so the test written there asserts the corrected sentence rather
than pinning the wrong one and being rewritten.
