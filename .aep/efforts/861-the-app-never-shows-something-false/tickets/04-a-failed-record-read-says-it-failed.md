---
status: resolved
blocked-by: [03]
---

# fix(desktop): a failed record read says it failed

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `pkg/block/record-surface.svelte`*).

## Outcome

The record surface draws the failed state for a read that failed, keeps *not found* for a record that does not exist, and its five record callers and the workspace page pass the failure.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (the records).

- [x] `RecordSurface` takes `failed` and `onRetry`, draws the failed state before *not found*, and leaves the breadcrumb's record name unset rather than absent; `pkg/block/tests/record-surface.svelte.test.ts` covers failed, not found and found. Verified: `vitest run record-surface.svelte.test.ts` in packages/design: 16 of 16 pass, covering failed with retry, not found, found, and the trail's name left `undefined` on a failed read.
- [x] The tenant, complex, unit, contract and payment record pages and the workspace page pass `toReadFailure`; the workspace page's `isLoading` no longer special-cases `isError`; a test with a rejecting host covers the workspace page and one record page. Verified: a grep finds `toReadFailure` in all six callers; the workspace page's `isLoading` is `stateQuery.isLoading`; `vitest run details-read.svelte.test.ts page-read.svelte.test.ts`: 5 of 5 pass (tenant page and workspace page against a rejecting host, and a missing tenant still not found, read through `readRecord`).

## Relevant areas

- packages/design/src/lib/block/record-surface.svelte
- apps/desktop/src/lib/tenant/component/details.svelte, complex/component/details.svelte, complex/unit/component/details.svelte, contract/component/details.svelte, payment/component/details.svelte
- apps/desktop/src/lib/organization/workspace/component/page.svelte

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
