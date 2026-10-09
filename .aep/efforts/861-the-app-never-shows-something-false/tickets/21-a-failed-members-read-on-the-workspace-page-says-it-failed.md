---
status: resolved
---

# fix(desktop): a failed members read on the workspace page says it failed

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 1 names the workspace page; criterion 1), and ticket 04. Found at review round 2 (correctness).

## Outcome

The workspace page reads its state and its members, and a failure of either draws the failed state with *try again*, which runs every read that failed again; the page never says the workspace is held by nobody, nor offers to add holders, from a members read that failed.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (the workspace page).

- [x] The workspace page's failure is the state read's or the members read's, through `toReadFailure`, and *try again* reruns each that failed; no *no members* sentence and no holders empty state is drawn from a failed members read. Verified: `page.svelte` takes `failed`, `onRetry` and `retrying` from `toReadsFailure(toReadFailure(stateQuery), toReadFailure(membersQuery))`, whose retry reruns only the reads that failed (`read.test.ts`, 16 pass); it loads while either read is on its way, so no *no members* is drawn from members not yet read either.
- [x] `organization/workspace/tests/page-read.svelte.test.ts`: with `organization.members` rejecting and the state read answering, the failed state is drawn and *no members* is not; *try again* draws the members once the read answers. Verified: `vitest run src/lib/organization/workspace/tests`: 139 of 139 pass; with the members rejecting and the state answering the failed state is drawn and *no members*, *nobody holds* and the holders' empty block are not; try again reruns the members and draws ada; members held pending draw none of those either.

## Relevant areas

- apps/desktop/src/lib/organization/workspace/component/page.svelte, organization/workspace/tests/page-read.svelte.test.ts
- apps/desktop/src/lib/error/read.ts (only if two reads need combining there)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
