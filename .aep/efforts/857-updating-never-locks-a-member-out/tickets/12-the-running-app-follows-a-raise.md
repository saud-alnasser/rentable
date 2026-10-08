---
status: resolved
blocked-by: [05, 10, 11]
---

# feat(sync): the running app follows a floor raise

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `sync/` and `startup/heartbeat.ts`*).

## Outcome

When a pull brings a floor raise into a running app, it moves to read-only with a standing notice carrying the update action, or, below the read floor, to the organization switcher with its callout (the organization) or the update screen (a workspace), before anything else is written, including the reconcile that follows a pull.

## Acceptance Criteria

Traces requirement 6, requirement 9, criterion 6 and criterion 9.

- [x] The sync outcome carries `standing` and the refusal code instead of flattening to text.
- [x] `applySyncOutcome` moves to read-only or `held` before `reconciliation.received()`, and the day-crossing reconcile does nothing while read-only.
- [x] A read-only notice in the shell's `notice` slot, on the `locked-notice.svelte` pattern, carries the sentence and `update-action` as `notice`.
- [x] Tests: a pulled raise moves the app before reconcile runs; the notice is drawn in both languages.

## Relevant areas

- apps/desktop/src/lib/sync/autosync.ts, workspace.ts
- apps/desktop/src/lib/startup/heartbeat.ts, reconcile.ts
- apps/desktop/src/lib/organization/component/ (new read-only notice), surface.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
