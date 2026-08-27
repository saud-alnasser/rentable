---
status: open
---

# fix(desktop): a record that is still loading says so about the record

## Outcome

A reader waiting on a record is told the record is on its way, in words that are about the
record, in both locales. The package's contract key and what the desktop supplies for it say
the same kind of thing, so a second consumer reading the docstring supplies the same kind of
sentence.

## Acceptance Criteria

Traces requirement 8 of the spec, and its criterion 8.

- [ ] A record surface that is still loading renders a sentence about the record rather than
      about the application, in both locales.
- [ ] The contract key and what the desktop supplies for it agree.
- [ ] The spec's Open Question is answered in the spec before this is built, not during it:
      whether the sentence is the contract's or the caller's.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

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
