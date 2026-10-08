---
status: resolved
blocked-by: [01, 04]
---

# feat(organization): additions arrive on their own

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Architecture, including Steps shipped before 857, Recording what ran and Where the verdict lives; Components, `organization/lease/` and `upgrade/format/`; Data Model*).

## Outcome

Opening a workspace or an organization on a newer build runs every pending step shipped before 857 exactly as 0.20 does, and every pending step declared an addition after it, by any member who can today; later upgrade steps are left for ticket 07; what ran above the workspace's `schema_version` is recorded, the first post-857 step writes the floor record, and the numbers pre-857 builds read are not moved by an addition.

## Acceptance Criteria

Traces requirement 1, requirement 13, criterion 1 and criterion 13.

- [x] Every step shipped before 857 carries the `shipped_before_857` mark, and a workspace or organization behind one of them (a workspace at 5 or 6, an organization at format 1 or 2) opens on this build exactly as on 0.20: format 1 to 2 on the owner's machine, the rest by the first full-access member; a test per case.
- [x] `lease::upgrade` on open applies pending additions, records any step above `schema_version` in the workspace's `applied_step`, and leaves the organization's `workspace.schema_version` unchanged; the fresh-database check builds from the same prefix and set.
- [x] The format runner applies pending organization additions for any member and leaves `format` unchanged; `complete_schema` runs for an organization whose format is behind this build's when only additions separate them.
- [x] The first post-857 step applied writes `data_floor` and `workspace_floor` (or `organization_floor`) holding the floors read before it, so a test that applies a fake addition finds the addition applied, both floors and both legacy numbers unchanged, and the data read-write, opened as a member and as a manager.
- [x] A test with a fake pending upgrade step declared after 857 opens read-write, runs nothing of that step, and still applies a fake addition declared after it.

## Relevant areas

- apps/desktop/tauri/src/organization/lease/mod.rs (`is_pending`, `upgrade`), apply.rs
- apps/desktop/tauri/src/organization/workspace/command.rs (`workspace_open`)
- apps/desktop/tauri/src/upgrade/format/runner/, upgrade/step.rs, upgrade/floor.rs
- apps/desktop/tauri/src/organization/store/mod.rs (`complete_schema`)

## Constraints

- Reach the step declarations and floors through the structure ticket 04 settled under `guard/cycle.rs`.
- The copy and the fresh-database check of effort 838 still wrap anything applied.
- Shipped migration files are not edited ([[rules/migrations]]).
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
