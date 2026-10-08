---
status: open
---

# fix(design): the form surface asks before discarding changes

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, Closing a form with changes; Interfaces, `FormSurface`, `ConfirmDialog`*).

## Outcome

The form surface takes `dirty`, asks discard or keep editing on Escape, an outside click, the corner close or `requestClose` while dirty, closes at once while clean, and hands its actions a `requestClose` that every cancel button uses.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (the surface).

- [ ] `ConfirmDialog` takes `cancelLabel`; the discard question uses the contract's `discardChangesTitle`, `discardChangesDescription`, `discard` and `keepEditing`, in the destructive tone, with keep editing focused first.
- [ ] `pkg/block/tests/form-surface.svelte.test.ts`: each of the four closes asks when dirty and closes when clean; keep editing keeps the form open with focus inside it; discard closes; Escape in the question closes only the question.
- [ ] Every cancel button on the 22 forms calls `requestClose`.
- [ ] [[rules/interface]], under *Form surface*, says a form with changes asks before it closes.

## Relevant areas

- packages/design/src/lib/block/form-surface.svelte, block/confirm-dialog.svelte, strings.ts, block/tests/
- apps/desktop/src/tests/form-surface-harness.svelte
- every form on the surface (its cancel button only)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A submit still closes through the form's own path and never asks.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
