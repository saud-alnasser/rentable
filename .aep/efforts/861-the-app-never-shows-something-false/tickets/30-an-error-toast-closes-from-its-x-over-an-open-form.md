---
status: resolved
---

# fix(design): an error toast closes from its X over an open form

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 4: an error toast stays until closed, and closes from its control). Found by the owner in ticket 28's staged error toast.

## Outcome

The X on an error toast closes it while a form is open behind it, and pressing it leaves the form as it was.

## Acceptance Criteria

Traces requirement 4.

- [x] The X closes the toast over an open dialog. Verified: in the staged error toast, a real click on the X removed the toast in English and Arabic; before, a modal dialog's `pointer-events: none` on `<body>` reached the toaster, and the press fell through to the form under the X.
- [x] Pressing a toast does not close the form or ask to discard. Verified: after the click the changed tenant form is still open with its change and no discard question; the provider test holds that a press on a toast never reaches the document, where a dialog reads a press as leaving it. `pnpm test` passes in apps/desktop (1917 and 1172) and packages/design (194 and 212); lint and check are clean.

## Relevant areas

- packages/design/src/lib/primitive/sonner/sonner.svelte, apps/desktop/src/lib/notification/tests/provider.svelte.test.ts
