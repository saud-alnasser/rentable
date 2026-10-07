---
status: open
---

# feat(organization): a link refused for its version offers the update

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: joining by link or invitation an organization this machine does not hold yet, refused for its version, shows the reason with the update action on the join screen, and the person can leave it for the switcher.

## Acceptance Criteria

Traces requirement 7, requirement 8 and criterion 7.

- [ ] The join screen draws `update-action` as `notice` beside the reason when the refusal is the version (`organizationNewer`, `workspaceNewer`, or read-only refusing the join's write).
- [ ] A component test, in Arabic and English, finds the reason and the update action on the join screen for a version refusal, and only the reason for any other.
- [ ] [[contexts/desktop/organization]] states what joining does on a version refusal for an organization not held.

## Relevant areas

- apps/desktop/src/lib/organization/setup/component/join.svelte, src/lib/startup/wall.ts
- .aep/contexts/desktop/organization.md

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
