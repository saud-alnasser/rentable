---
status: resolved
---

# fix(desktop): a failed list read says it failed

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Architecture, A failed read; Components, `pkg/block/empty.svelte`, `pkg/strings.ts`, `error/read.ts`, `list/component/list.svelte`*).

## Outcome

The empty block has a `failed` kind with *try again*, the design contract carries its words, `error/read.ts` decides what a failed read is, and every list drawn by the list shell draws the failed state instead of *nothing here yet* when its read fails.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (the lists).

- [x] `Empty` accepts `kind="failed"` with `onRetry`, marks `data-empty="failed"`, and offers *try again*; `pkg/block/tests/empty.svelte.test.ts` covers it. Verified: `vitest run src/lib/block/tests/empty.svelte.test.ts` in packages/design, 6 of 6 pass, including the two failed-kind tests (`data-empty="failed"`, try again calls `onRetry`).
- [x] `toReadFailure` reports failed only for an error with no data; a unit test covers an error with data, an error without, and a success with none. Verified: `node --test src/lib/error/tests/read.test.ts`, 5 pass 0 fail (error with data, error without, success with none, pending, retry re-runs).
- [x] The list shell takes `failed` and `onRetry` and draws the failed state with no create, no *nothing yet* title and no count; `list/tests/list-empty.svelte.test.ts` covers it, and *try again* calls `onRetry`. Verified: `vitest run list-empty.svelte.test.ts directory-read.svelte.test.ts`, 14 of 14 pass; the three failed-state tests check no create, no nothing-yet title, no count, and try again calling `onRetry`.
- [x] All eight list callers pass both from `toReadFailure`; one directory test with a rejecting host shows the failed state and re-runs the read on *try again*. Verified: a grep finds `toReadFailure` in the tenant, complex, unit and contract directories, tenant-contracts, unit-contracts, record-history and the payment ledger; `tenant/tests/directory-read.svelte.test.ts` rejects `tenant.getMany`, shows the failed state, and draws the tenant after try again.
- [x] [[rules/interface]], under *Empty* and *Error*, names the failed situation. Verified: `.aep/rules/interface.md` names the failed read under *Empty* and under *Error*.

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
