---
status: open
blocked-by: [16]
---

# feat(update): the app looks for an update whenever it is held

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: besides the launch, the app looks for an update each time a version holds it (the switcher callout, the update-required screen, read-only), so a held person sees a release without pressing anything.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [ ] Entering a version hold (an organization refused for its version, a workspace on update-required, read-only by version) triggers a check and a background download when none has run since the hold began; one hold never checks twice.
- [ ] A test covers each of the three holds, and that staying in one hold does not check again.

## Relevant areas

- apps/desktop/src/lib/update/updater.svelte.ts (`lookAtLaunch`), src/lib/startup/machine.ts, heartbeat.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
