---
status: resolved
---

# fix(organization): a workspace's hold stays the workspace's, and saves wait only for a pull

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round two (correctness 1 to 4): a workspace that is behind in a read-only organization is refused with a workspace reason, so the person stays in with the other workspaces reachable; saves wait only for a pull and its verdict, never for a push; a transient floor-read error never tells someone on the newest build to update; and refusals about the organization (for example `memberGone`) reach the switcher.

## Acceptance Criteria

Traces requirement 6, requirement 7, requirement 9, criterion 6, criterion 7 and criterion 9.

- [x] A workspace behind in an organization read-only by version is refused with a workspace-scoped reason, and the front end keeps the person in the organization on the workspace-held screen with the other workspaces reachable; a Rust test and a startup test, including the next sign-in not looping.
- [x] `Database::judging` is held around the pull and its verdict only, never around the push; a test finds a save during a slow push commits without waiting.
- [x] A transient error reading a workspace's floors keeps its last verdict, as the organization's does, and is never reported as a newer version; a test.
- [x] `whose-refusal.ts` sends every reason that is about the organization or the member (`memberGone`, `machineMissing`, and the others raised by the state read and sign-in) to the switcher; a test per reason added.

## Relevant areas

- apps/desktop/tauri/src/organization/lease/mod.rs, organization/session/version.rs, command.rs, database/mod.rs
- apps/desktop/src/lib/startup/whose-refusal.ts

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say so if none.
