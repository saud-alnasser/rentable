---
status: resolved
---

# fix(design): try again shows that it is trying

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, A failed read*). Found at converge round 1.

## Outcome

While a failed read runs again after *try again*, the failed block says so: its *try again* control shows it is busy and cannot be pressed twice, and keeps the keyboard focus it had, so the reader is never left wondering whether the press did anything.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (*try again* re-runs the read).

- [x] `Empty kind="failed"` takes a `retrying` flag; while it is set the *try again* control is marked busy (`aria-busy`), ignores a second press, and keeps focus; `pkg/block/tests/empty.svelte.test.ts` covers it. Verified: `vitest run src/lib/block/tests/empty.svelte.test.ts` in packages/design: 8 of 8 pass; while `retrying`, try again is `aria-busy`, a second press does nothing, and the button, never `disabled`, keeps focus.
- [x] `toReadFailure` reports `retrying` from the query's refetch in flight; its unit test covers it. Verified: `node --test src/lib/error/tests/read.test.ts`: 12 pass, 0 fail, including four `retrying` cases (no data, a run in flight, an earlier error).
- [x] The list shell, the record surface and the landing screen pass it through; one list test shows the control busy while a held read reruns and the list drawn once it answers. Verified: `vitest run tenant/tests/directory-read.svelte.test.ts`: 3 of 3 pass, holding the reread: the control is busy, focused and still in the failed block, a second press calls nothing, then the tenants are drawn; record-surface and landing tests added beside it.

## Relevant areas

- packages/design/src/lib/block/empty.svelte, block/record-surface.svelte, primitive/button/
- apps/desktop/src/lib/error/read.ts, list/component/list.svelte, dashboard/component/landing.svelte, the list and record callers

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- No automatic retry: the query client's `retry: false` stays (spec, *Out of Scope*).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
