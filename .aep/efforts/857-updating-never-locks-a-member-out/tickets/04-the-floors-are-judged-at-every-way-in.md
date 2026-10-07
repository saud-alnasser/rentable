---
status: open
blocked-by: [01]
---

# fix(organization): the floors are judged at every way in, after a pull

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `organization/session/`; Technical Approach, step 4*).

## Outcome

Every way in (launch, resume, sign-in, join by link or invitation, switching workspace, and reaching a workspace that is not open) pulls first, judges this build against the floors, and only then writes; resume carries a version refusal on `OrganizationState` instead of dropping it; and the heartbeat judges after the organization pull and before the workspace push.

## Acceptance Criteria

Traces requirement 2, requirement 8, requirement 9, criterion 2 and criterion 9.

- [ ] `refuse_another_format` and `lease::refuse_newer` become the floor verdict: refused below the read floor (`OrganizationNewer`, `WorkspaceNewer`), let through read-only below the write floor, read-write otherwise.
- [ ] `open_replica`, `resume_remembered`, sign-in, `connect` for an organization already held, join and accept, and the launch's `open_database` pull before judging and write nothing before it, including `owner_row_repaired` and `carry_locks_over`.
- [ ] A resume refused for its version sets `heldByVersion: { target, standing, reason }` on `OrganizationState` instead of logging only.
- [ ] `session_replicate` judges the organization and the open workspace after the organization pull, sets the workspace's `standing`, and does not push a workspace this build may not write; the result carries `standing`.
- [ ] Tests: each entry with the floors raised past this build is refused or read-only with nothing written after the pull; a floor raise pulled into a running session is judged before the heartbeat's next write.

## Relevant areas

- apps/desktop/tauri/src/organization/session/replica.rs, command.rs, heartbeat.rs
- apps/desktop/tauri/src/organization/invitation/connect.rs, join.rs
- apps/desktop/tauri/src/organization/workspace/open.rs, remote.rs
- apps/desktop/tauri/src/organization/lease/mod.rs (`refuse_newer`)

## Constraints

- The frontend's reaction to `heldByVersion` and `standing` is tickets 11 and 12; here they only cross the boundary, with their TS types.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
