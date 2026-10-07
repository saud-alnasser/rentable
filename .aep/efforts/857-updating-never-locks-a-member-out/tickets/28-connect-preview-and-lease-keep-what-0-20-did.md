---
status: open
---

# fix(organization): connect, the preview and the lease keep what 0.20 did

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round one (correctness 7, 8, 10): connecting by link to an organization already held selects it as 0.20 did, the upgrade preview lists machines that signed out within the window, and a crashed upgrade does not hold everyone for the lease's whole lifetime.

## Acceptance Criteria

Traces requirement 3, requirement 5, criterion 3 and criterion 5.

- [ ] Connecting by link to an organization this machine already holds selects it before any format verdict, as 0.20 did, including one at format 2 waiting for its owner; a test.
- [ ] The workspace and organization previews list a machine seen within seven days whose member signed out, by machine name and version; a test.
- [ ] An upgrade lease left by a run that died is released by the same member's next start, or by any holder of `upgradeData` once the run is known dead, rather than holding every other member until it lapses; a test.

## Relevant areas

- apps/desktop/tauri/src/organization/invitation/connect.rs
- apps/desktop/tauri/src/organization/upgrade/mod.rs (preview, lease)

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]); where a finding turns out not to reproduce, say so in Notes with the evidence and leave its box unticked for the orchestrator.
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
