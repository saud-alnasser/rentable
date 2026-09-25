---
status: open
blocked-by: [10]
---

# feat(desktop): printing opens the application's own preview

## Outcome

The print act on a contract or a payment opens a preview inside the application: the schedule or
the receipt drawn as a one-language document, an Arabic/English choice starting on the language
the application shows, and *save as PDF* and *print*.

## Acceptance Criteria

Traces requirements 7, 9 and 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]],
as revised on 2026-09-25, and criteria 7, 9(c) and 10.

- [x] The preview opens on the application's language, and switching the toggle redraws the page in
      the other (criterion 10(a), component test).
- [x] The printed schedule and the receipt each take one locale: an Arabic page carries no English
      and reads right to left, an English page carries no Arabic (criteria 7 and 9(c), component
      tests); every fact of requirement 9 is still on the receipt.
- [x] Each page reads as a document: the issuer at the head's start, title, number and date at its
      end, then the facts; spacing on the ladder of [[rules/frontend]] (component test on structure).
- [x] *Save as PDF* asks for a path through the save dialog, then prints with `mode: 'pdf'`; *print*
      prints with `mode: 'print'`; a refusal is one sentence (host test).
- [x] [[rules/interface]], *Print*, and [[rules/frontend]], *i18n*, say what is now true.
- [ ] By hand on Windows, macOS and Linux: the preview, both languages, the PDF's Arabic shaped and
      selectable, paper light in the dark appearance, no shell on the page (criteria 10(a) to
      10(d)). Held for the close of the run.

## Relevant areas

- new `apps/desktop/src/lib/print/component/preview.svelte`
- `apps/desktop/src/lib/contract/component/printed-schedule.svelte`, `host.svelte`
- `apps/desktop/src/lib/payment/component/receipt.svelte`, `host.svelte`
