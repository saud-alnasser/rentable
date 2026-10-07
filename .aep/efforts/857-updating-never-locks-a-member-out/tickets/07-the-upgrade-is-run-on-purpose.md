---
status: open
blocked-by: [01, 02, 03, 06]
---

# feat(organization): the upgrade is run on purpose

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `organization/upgrade/`; Interfaces; Data Model*).

## Outcome

`organization_upgrade_preview` and `organization_upgrade_run` exist for the organization and for one workspace: the preview lists what the pending upgrade steps change and which machines they would stop or make read-only, and the run applies them whole or not at all under the lease, writes the floors, and moves the legacy number only when the new floor stops pre-857 builds.

## Acceptance Criteria

Traces requirement 3, requirement 5, criterion 3 and criterion 5.

- [ ] Both commands are gated by `upgradeData` through `GATES`; a step with `needs_owner` is refused to anyone but the owner with `UpgradeNeedsOwner`; tests cover the owner, a manager, a custom role, overrides granting and removing, and the member role.
- [ ] The preview returns `steps`, `stopped`, `readOnly` and `unseen` from `machine_version` and `machine.seen_at` within seven days; a machine with no `machine_version` row is listed as on an unknown version.
- [ ] The run takes the copy, applies the steps, checks against a fresh database, and writes `data_floor` inside the workspace and `workspace_floor` or `organization_floor` in the organization; a failure partway leaves version, floors, tables and legacy numbers as before, with the copy written.
- [ ] A second session's write to the workspace while the lease is held waits or is refused; nothing lands between the steps.
- [ ] `workspace.schema_version` or `format` moves only when the new read or write floor exceeds what any pre-857 build knows, and then to a value every pre-857 build refuses.

## Relevant areas

- apps/desktop/tauri/src/organization/ (new `upgrade/`), lease/, upgrade/format/runner/
- apps/desktop/tauri/src/organization/mod.rs (`GATES`)
- apps/desktop/tauri/src/backup.rs, schema/

## Constraints

- The `describes` keys of each step need sentences in Arabic and English, owned by this ticket.
- This ticket ships no interface; ticket 08 does.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
