---
status: resolved
blocked-by: [18]
---

# fix(desktop): Windows prints from a window of its own

## Outcome

On Windows the application never changes on screen while a page prints or saves: the page is drawn
in a print window behind the application and printed from there, so the window the reader is
looking at does not turn light or show the page alone for a moment.

## Acceptance Criteria

Traces requirement 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], as
revised on 2026-09-25, criteria 10(b) to 10(d).

- [x] On Windows `print()` hands the host the page whole (stylesheets, the sheet, its language and
      direction), and paper is done when the host answers (`print/tests/sheet.svelte.test.ts`,
      15 passed).
- [x] `print_page` with a page draws it in a print window made from `static/print.html`, behind the
      application, prints or writes the PDF from it, and closes it; without one it prints the main
      window as before (`cargo check` and `clippy` clean; Rust suite passes).
- [x] By hand on Windows: saving a PDF and printing leave the application as it is, with no light
      flash, and the print dialog opens over it.
      Confirmed by the human on 2026-09-25 ("everything good"), on Windows.