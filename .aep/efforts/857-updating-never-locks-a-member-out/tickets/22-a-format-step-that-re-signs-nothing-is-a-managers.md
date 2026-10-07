---
status: open
blocked-by: [19]
---

# feat(upgrade): a format step that re-signs nothing is a manager's to run

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: a format step declared `needs_owner: false` runs for any holder of `upgradeData` through the organization upgrade command; only a step that re-signs waits for the owner's key.

## Acceptance Criteria

Traces requirement 3 and criterion 3.

- [ ] The format runner refuses with `UpgradeNeedsOwner` only a step declared `needs_owner`; a fake format step with real work and `needs_owner: false` runs for a manager and moves the floors.
- [ ] The test runs through the real runner, not a stub `work`.

## Relevant areas

- apps/desktop/tauri/src/upgrade/format/runner/mod.rs, organization/upgrade/command.rs, database/step.rs

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
