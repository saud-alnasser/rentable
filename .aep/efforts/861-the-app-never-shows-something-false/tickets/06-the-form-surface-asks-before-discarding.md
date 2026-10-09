---
status: resolved
---

# fix(design): the form surface asks before discarding changes

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, Closing a form with changes; Interfaces, `FormSurface`, `ConfirmDialog`*).

## Outcome

The form surface takes `dirty`, asks discard or keep editing on Escape, an outside click, the corner close or `requestClose` while dirty, closes at once while clean, and hands its actions a `requestClose` that every cancel button uses.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (the surface).

- [x] `ConfirmDialog` takes `cancelLabel`; the discard question uses the contract's `discardChangesTitle`, `discardChangesDescription`, `discard` and `keepEditing`, in the destructive tone, with keep editing focused first. Verified: `vitest run confirm-dialog.svelte.test.ts form-surface.svelte.test.ts` in packages/design, 23 of 23 pass; the surface passes `cancelLabel={keepEditing}` and the four contract strings, `tone` defaults to `error` (destructive).
- [x] `pkg/block/tests/form-surface.svelte.test.ts`: each of the four closes asks when dirty and closes when clean; keep editing keeps the form open with focus inside it; discard closes; Escape in the question closes only the question. Verified: the same run; the file covers Escape, outside press, corner close and `requestClose`, dirty and clean, keep editing, discard, Escape inside the question, and a submit never asking.
- [x] Every cancel button on the 22 forms calls `requestClose`. Verified: a grep over every desktop file that uses `FormSurface`: the 19 with a cancel or dismiss control call `requestClose`; reminder-preview, made-link and print preview have none.
- [x] [[rules/interface]], under *Form surface*, says a form with changes asks before it closes. Verified: `.aep/rules/interface.md`, *Form surface*, says a form with changes asks before it closes.

## Relevant areas

- packages/design/src/lib/block/form-surface.svelte, block/confirm-dialog.svelte, strings.ts, block/tests/
- apps/desktop/src/tests/form-surface-harness.svelte
- every form on the surface (its cancel button only)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A submit still closes through the form's own path and never asks.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes

No changeset: on its own this commit makes no form ask, since every form passes no `dirty` and the surface defaults it to false. Tickets 07 and 08 wire the forms and carry the changesets that announce it.
