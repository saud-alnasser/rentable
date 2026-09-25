---
status: resolved
blocked-by: [06]
---

# feat(desktop): Windows prints and saves a PDF without the browser preview

## Outcome

A `print_page` command prints what the sheet holds: on Windows it writes a PDF to a chosen path
with no dialog, or opens the operating system's print dialog instead of the webview's browser-style
preview; on macOS and Linux it opens the system print panel.

## Acceptance Criteria

Traces requirement 10 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], as
revised on 2026-09-25.

- [x] `print_page({ mode: 'pdf', path })` on Windows writes the file through `PrintToPdf`, with
      backgrounds printed and no header or footer, and answers once it is written (criterion 10(b),
      `cargo check` and a Rust test of the settings it builds).
- [x] `print_page({ mode: 'print' })` on Windows opens `ShowPrintUI` with the system dialog kind;
      on macOS and Linux either mode calls `Webview::print()` (criteria 10(b), 10(c)).
- [x] The command is registered and the capability allows it; `webview2-com` and `windows` are
      `cfg(windows)` dependencies at the lockfile's versions.
- [x] `print()` in `print/sheet.svelte.ts` takes the mode and, for `pdf`, a path, and settles on the
      command's answer (sheet test).
- [x] By hand on Windows: *save as PDF* writes the file with no dialog, and *print* shows the OS
      dialog, not the browser preview (criteria 10(b), 10(c)).
      Confirmed by the human on 2026-09-25 ("everything good"), on Windows.

## Relevant areas

- `apps/desktop/tauri/src/lib.rs`, new `tauri/src/print.rs`, `tauri/Cargo.toml`,
  `tauri/capabilities/default.json`
- `apps/desktop/src/lib/print/sheet.svelte.ts`, `apps/desktop/src/lib/platform/tauri.ts`
- [[efforts/835-the-rent-is-receipted-scheduled-and-chased/evidence/research/printing-a-page-from-the-webview]], F3.1

## Constraints

- A flag: dependencies moved.
