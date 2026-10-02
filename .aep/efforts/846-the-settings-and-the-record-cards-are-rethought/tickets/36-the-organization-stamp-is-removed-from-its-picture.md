---
status: resolved
blocked-by: []
---

# feat(desktop): the organization stamp is removed from its own picture

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "the remove singtaure or seal section of the singtaure ore seal; needs to be integrated in into the parto f the iamge not a sapreate thing maybe a button or a thilng; also it should be named the section not "signature or seal" it should be "orgnizations stamp" or thing like that". The organization tab's signature-or-seal card is named *organization stamp* (Arabic *ختم المؤسسة*) in its title and wherever the app names it (the command menu, confirmations, receipts' wording that names the thing, the strings). Its separate remove row goes: removing is a small icon button on the stamp preview's corner (`trash-2` or `x`), in the error tone on the button alone, named by its tooltip, confirmed as today. The preview stays the control that replaces the stamp; with no stamp there is no remove button and the empty preview chooses one.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirements 2 and 5.

- [x] The card's title reads organization stamp in English and its Arabic in Arabic, and no string the user meets still says signature or seal; the i18n tests pass. *Verified: `node --test src/lib/i18n/tests/*.test.ts` printed pass 29, fail 0; `mark.svelte.test.ts` finds the title organization stamp and ختم المؤسسة, and no card text, label or string saying signature, seal or توقيع.*
- [x] A test: the card has no remove row; the preview carries a remove icon button named by its tooltip, red on the button alone, opening the confirmation; with no stamp there is none; pressing the preview still opens the picker. *Verified: `vitest run organization/tests/mark.svelte.test.ts app/tests/settings-area.svelte.test.ts` printed 63 passed: no remove row; a round `trash-2` button on the preview's corner, red alone, labelled and tooltipped remove organization stamp, opening the confirmation; none with no stamp; the preview still opens the picker.*
- [x] [[rules/interface]] and [[contexts/desktop/components]] say the stamp's remove sits on its picture; `validate.mjs` passes. *Verified: read rules/interface (*Settings section*, the stamp's remove as the one ending act that sits on its picture) and the components context's new row; `validate.mjs` printed no failures; desktop check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/organization/component/mark.svelte`, the organization and settings i18n

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Keep code identifiers (`mark`) as they are; only the words change.
