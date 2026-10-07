---
status: open
---

# fix(startup): a refusal signs out only what it is about

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round one (correctness 1, 13, 14; standards 2, 6): a refusal about one workspace never signs the person out of the organization, nothing of one organization carries over to the next, and a join refusal never signs the person out of another organization.

## Acceptance Criteria

Traces requirement 7, requirement 8, criterion 7 and criterion 8.

- [ ] Only an organization's refusal returns to the switcher: `workspaceBehind`, `workspaceNeedsOpening`, `copyNotTaken`, `shapeNotAsBuilt`, `workspaceReadOnlyByVersion`, `changesUnsendableAfterUpgrade` and every other workspace reason keep the person in the organization, on the screen that names the reason, with the other workspaces reachable; a test per reason.
- [ ] A later sign-in after a workspace refusal does not reopen the refused workspace by itself; `#opening` is cleared on sign-out and on leaving an organization, so another organization opens its own last workspace; a test covers both.
- [ ] A join refusal for organization A never signs the person out of organization B they are in, whatever the reason, and the accept path guards on the attempt as the connect path does; a test covers both paths.
- [ ] The classifier is named for its job, not `refusal.ts` (reserved by [[rules/module-layout]]), and its reason lists are typed as `TauriRefusalReason`, as `organization/setup/connect.ts` does.

## Relevant areas

- apps/desktop/src/lib/startup/refusal.ts, machine.ts (`fail`, `#opening`), wall.ts
- apps/desktop/src/lib/organization/setup/component/join.svelte, connect.ts

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]); where a finding turns out not to reproduce, say so in Notes with the evidence and leave its box unticked for the orchestrator.
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
