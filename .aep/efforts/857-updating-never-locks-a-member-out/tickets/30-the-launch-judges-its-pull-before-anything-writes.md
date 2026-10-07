---
status: open
---

# fix(organization): the launch judges its pull before anything writes

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found while fixing review round one (ticket 27): at launch `open_database` pulls, lets go, then judges, so a write can land between the pull and its verdict, as it could on the heartbeat before ticket 27; the launch now holds saves between its pull and its verdict the same way, and the verdict's reason survives on the state read.

## Acceptance Criteria

Traces requirement 8, requirement 9, criterion 8 and criterion 9.

- [ ] The launch's workspace pull and its verdict run under the same hold ticket 27 gave the heartbeat, so a save arriving between them waits for the verdict; a test interleaves a save.
- [ ] The reason a verdict carries (for example floors that could not be read) reaches `OrganizationState` on the state read, not only the heartbeat's answer; a test.

## Relevant areas

- apps/desktop/tauri/src/organization/workspace/open.rs (`open_database`), organization/session/version.rs, command.rs

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say so if none.
