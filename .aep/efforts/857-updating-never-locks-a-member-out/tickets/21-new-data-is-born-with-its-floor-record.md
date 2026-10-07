---
status: open
---

# fix(upgrade): new data is born with its floor record

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: a workspace or organization created on this build writes its floor record at creation, with the floors its steps declare, so the first addition after 857 never refuses an older build that can read newly created data.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [ ] Creating a workspace writes `data_floor` and `workspace_floor`, and creating an organization writes `organization_floor`, holding the read and write floors the steps declare, not the level.
- [ ] A test with a fake addition declared after 857 creates a workspace and an organization and finds a build knowing one step less reads and writes them.
- [ ] The legacy numbers written at creation stay what a pre-857 build accepts unless a declared floor says otherwise.

## Relevant areas

- apps/desktop/tauri/src/organization/workspace/mod.rs (create), lease/apply.rs (`apply_between`), organization/store/format.rs (`write_format`), database/floor.rs

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
