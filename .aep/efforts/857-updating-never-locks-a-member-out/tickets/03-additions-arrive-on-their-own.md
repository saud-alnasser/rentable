---
status: open
blocked-by: [01]
---

# feat(organization): additions arrive on their own

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Architecture; Components, `organization/lease/` and `upgrade/format/`*).

## Outcome

Opening a workspace or an organization on a newer build applies the pending steps declared additions, and only those, by any member who can today, so a member's newer build opens everything; steps declared upgrades are left for ticket 07, and the numbers pre-857 builds read are not moved by an addition.

## Acceptance Criteria

Traces requirement 1 and criterion 1.

- [ ] `lease::upgrade` on open applies only pending additions, records the workspace's structure inside the workspace as today, and leaves the organization's `workspace.schema_version` unchanged.
- [ ] The format runner applies pending organization additions for any member and leaves `format` unchanged; `complete_schema` runs for an organization whose format is behind this build's when only additions separate them.
- [ ] A test seeds a workspace and an organization whose only pending steps are a fake addition, opens them as a member and as a manager, and finds the addition applied, both floors and both legacy numbers unchanged, and the data read-write.
- [ ] A test with a fake pending upgrade step opens read-write and runs nothing of that step.

## Relevant areas

- apps/desktop/tauri/src/organization/lease/mod.rs (`is_pending`, `upgrade`)
- apps/desktop/tauri/src/organization/workspace/command.rs (`workspace_open`)
- apps/desktop/tauri/src/upgrade/format/runner/
- apps/desktop/tauri/src/organization/store/mod.rs (`complete_schema`)

## Constraints

- The copy and the fresh-database check of effort 838 still wrap anything applied.
- A pending removal blocks no later addition; additions after it still apply.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
