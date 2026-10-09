---
status: open
---

# fix(design): try again shows that it is trying

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, A failed read*). Found at converge round 1.

## Outcome

While a failed read runs again after *try again*, the failed block says so: its *try again* control shows it is busy and cannot be pressed twice, and keeps the keyboard focus it had, so the reader is never left wondering whether the press did anything.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (*try again* re-runs the read).

- [ ] `Empty kind="failed"` takes a `retrying` flag; while it is set the *try again* control is marked busy (`aria-busy`), ignores a second press, and keeps focus; `pkg/block/tests/empty.svelte.test.ts` covers it.
- [ ] `toReadFailure` reports `retrying` from the query's refetch in flight; its unit test covers it.
- [ ] The list shell, the record surface and the landing screen pass it through; one list test shows the control busy while a held read reruns and the list drawn once it answers.

## Relevant areas

- packages/design/src/lib/block/empty.svelte, block/record-surface.svelte, primitive/button/
- apps/desktop/src/lib/error/read.ts, list/component/list.svelte, dashboard/component/landing.svelte, the list and record callers

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- No automatic retry: the query client's `retry: false` stays (spec, *Out of Scope*).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
