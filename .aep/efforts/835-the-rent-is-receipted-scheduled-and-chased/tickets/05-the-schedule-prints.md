---
status: open
blocked-by: [04]
---

# feat(desktop): the schedule prints

## Outcome

A print sheet in the main window prints whatever snippet it is handed and nothing else. The
contract's schedule is the first thing printed through it, with Arabic and English headings.

## Acceptance Criteria

Traces requirements 7 and 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and
its criteria 7 and 10.

- [x] `print/` exposes `print(snippet)`, which resolves on `afterprint`. The sheet is mounted in the
      layout frame outside the scrolling main
      ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Components*, `print/`).
- [x] Under `@media print`, every frame region but the sheet is hidden. A frame test asserts each
      region carries the hidden rule, so a region added later fails it.
- [x] `core:webview:allow-print` is in `capabilities/default.json`.
- [x] A *print* act on the contract prints the schedule: every row, headings in both languages,
      Western digits (criterion 7, component test on the snippet).
- [ ] By hand, on Windows, macOS and Linux: the dialog opens, the page shows no sidebar, titlebar or
      page address, and the dialog's PDF destination saves it (criteria 10(a) and 10(c), for the
      schedule). Held for the close of the run.

## Relevant areas

- `apps/desktop/src/lib/layout/component/frame.svelte`, `apps/desktop/src/app.css`
- `apps/desktop/tauri/capabilities/default.json`
- `apps/desktop/src/lib/contract/acts.ts`, `host.svelte.ts`
- [[efforts/835-the-rent-is-receipted-scheduled-and-chased/evidence/research/printing-a-page-from-the-webview]]

## Constraints

- No second window and no iframe (plan, *Printing: the approaches weighed*).
- Light tokens on paper, whatever the appearance.
- The act follows [[rules/interface]], *Record card actions*: it asks the host and never opens
  anything itself.
