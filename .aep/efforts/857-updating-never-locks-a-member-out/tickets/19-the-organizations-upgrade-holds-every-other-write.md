---
status: resolved
---

# fix(organization): the organization's upgrade holds every other write

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: while an organization upgrade runs, every other machine's ordinary organization write waits or is refused, not only another upgrade; and the floor-moving workspace case is tested as a manager as well as a member.

## Acceptance Criteria

Traces requirement 1, requirement 5, criterion 1 and criterion 5.

- [x] An organization write from another session while the organization upgrade's lease is held is refused with a reason, or waits, and lands nothing between the steps; a test covers a signed write and an unsigned one.
- [x] The test of a pending upgrade step on open (the floor-moving case in `lease/mod.rs`) runs as a member and as a manager.

## Relevant areas

- apps/desktop/tauri/src/organization/upgrade/mod.rs (the organization lease), organization/act.rs, organization/store/
- apps/desktop/tauri/src/organization/lease/mod.rs (tests)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
