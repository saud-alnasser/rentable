---
status: open
---

# fix(desktop): the preview closes before the page prints

## Outcome

Saving a page as a PDF or printing it closes the preview once, cleanly: the panel is closed and
gone before the page is laid out for paper, so it no longer opens and closes again with every
print pass.

## Acceptance Criteria

Traces requirement 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], as
revised on 2026-09-25, criterion 10(a): the preview is the application's own, and it closes as one.

- [x] `sendPage` clears the screen once nothing can be cancelled and before anything prints, and
      not where the save dialog was walked away from (`print/tests/sheet.svelte.test.ts`, 16 passed
      with the host test).
- [x] Both hosts close their preview and wait for it to finish animating out
      (`surfacesSettled`) as that step.
- [ ] By hand: *save as PDF* and *print* close the preview once, with no flicker. Held for the
      close of the run.
