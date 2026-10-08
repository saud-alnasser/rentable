---
status: resolved
---

# fix(organization): both verdicts cross, and the app follows each

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: the organization's and the open workspace's version verdicts both reach the frontend, at every way in and on the heartbeat, so a workspace read-only by version folds its writes away even when the organization is read-only too, and an unreadable workspace in a read-only organization meets the update-required screen.

## Acceptance Criteria

Traces requirement 6, requirement 7, requirement 9, criterion 6, criterion 7 and criterion 9.

- [x] `heldByVersion` (or its successor) carries the organization's verdict and the open workspace's verdict separately on `OrganizationState`, `session_replicate`'s result and the launch path; `held_after` and `session/version.rs` no longer keep only one.
- [x] `permissionsIn` clears the workspace's writes when the workspace is read-only by version whatever the organization's standing; a router test covers the organization and the workspace both read-only.
- [x] With the organization read-only and the workspace unreadable, the heartbeat and the launch land on the update-required screen; a test covers it.
- [x] [[contexts/desktop/organization]] says what crosses, correctly.

## Relevant areas

- apps/desktop/tauri/src/organization/session/version.rs, command.rs, heartbeat.rs
- apps/desktop/src/lib/api/context.ts, src/lib/startup/heartbeat.ts
- .aep/contexts/desktop/organization.md

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
