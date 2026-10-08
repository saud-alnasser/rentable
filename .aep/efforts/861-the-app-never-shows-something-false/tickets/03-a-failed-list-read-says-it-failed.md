---
status: open
---

# fix(desktop): a failed list read says it failed

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, A failed read; Components, `pkg/block/empty.svelte`, `pkg/strings.ts`, `error/read.ts`, `list/component/list.svelte`*).

## Outcome

The empty block has a `failed` kind with *try again*, the design contract carries its words, `error/read.ts` decides what a failed read is, and every list drawn by the list shell draws the failed state instead of *nothing here yet* when its read fails.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (the lists).

- [ ] `Empty` accepts `kind="failed"` with `onRetry`, marks `data-empty="failed"`, and offers *try again*; `pkg/block/tests/empty.svelte.test.ts` covers it.
- [ ] `toReadFailure` reports failed only for an error with no data; a unit test covers an error with data, an error without, and a success with none.
- [ ] The list shell takes `failed` and `onRetry` and draws the failed state with no create, no *nothing yet* title and no count; `list/tests/list-empty.svelte.test.ts` covers it, and *try again* calls `onRetry`.
- [ ] All eight list callers pass both from `toReadFailure`; one directory test with a rejecting host shows the failed state and re-runs the read on *try again*.
- [ ] [[rules/interface]], under *Empty* and *Error*, names the failed situation.

## Relevant areas

- packages/design/src/lib/block/empty.svelte, strings.ts, packages/design/src/tests/contract-strings.ts
- apps/desktop/src/lib/shell/component/window.svelte (the contract mapping), i18n
- apps/desktop/src/lib/error/read.ts (new), list/component/list.svelte, list/list.ts, list/component/empty.svelte
- the eight callers: the tenant, complex, unit and contract directories, tenant-contracts, unit-contracts, record-history, and the payment ledger

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- New strings in both locales; run the i18n generator ([[references/pnpm]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
