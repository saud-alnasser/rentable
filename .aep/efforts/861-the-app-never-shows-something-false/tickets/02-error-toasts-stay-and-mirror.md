---
status: open
---

# fix(desktop): error toasts stay until closed and mirror in Arabic

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, Error toasts*).

## Outcome

An error toast, from any path, stays until the reader closes it and carries a close control; success, warning and offer toasts keep their durations; the toaster stands at the bottom end in either reading direction.

## Acceptance Criteria

Traces requirement 3, requirement 4, criterion 3 and criterion 4.

- [ ] `notify.error` and `showErrorSentence` raise with `{ duration: Number.POSITIVE_INFINITY, closeButton: true }`; `notification/tests/notification.test.ts` asserts it for both and asserts a success toast carries neither.
- [ ] The sonner primitive sets `position`, `dir` and `closeButtonAriaLabel` from the design contract; a component test reads `data-x-position` as right under LTR and left under RTL.
- [ ] [[rules/interface]], under *Feedback*, says an error toast stands until closed.
- [ ] In the running application an error toast is still up after ten seconds, closes from its control, and sits bottom-left in Arabic and bottom-right in English; recorded under `## Needs you` for the close if the application cannot be driven.

## Relevant areas

- apps/desktop/src/lib/notification/notification.ts, notification/component/provider.svelte, notification/tests/
- packages/design/src/lib/primitive/sonner/sonner.svelte, strings.ts
- apps/desktop/src/lib/undo/move.ts (the offer duration, unchanged)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- `notification/notification.ts` stays the only importer of `toast` (`reach.test.ts`).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
