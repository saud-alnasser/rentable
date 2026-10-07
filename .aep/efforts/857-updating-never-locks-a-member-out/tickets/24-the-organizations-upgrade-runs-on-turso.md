---
status: open
---

# fix(organization): the organization's upgrade runs on Turso in one transaction

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `organization/upgrade/`*).

## Outcome

Found at converge round two: the organization upgrade runs its steps, its floor record and any legacy number as one transaction at the primary, as the workspace upgrade does, so no other machine's write lands between its steps or is lost to it; the machine running it then pulls the result.

## Acceptance Criteria

Traces requirement 5 and criterion 5.

- [ ] `organization_upgrade_run` for the organization applies its pending steps, writes `organization_floor` and moves `format` only as ticket 07 decides, all in one transaction at the primary over the pipeline; a failure partway leaves the primary as it was, with the copy written.
- [ ] A test with a second session's organization write pushed while the upgrade runs finds that write either refused or applied before the upgrade's transaction and carried through it, never lost and never landing between steps.
- [ ] The steps shipped before 857 still run on open as in 0.20, and the lease and `UpgradeUnderWay` of ticket 19 still hold other members' acts while it runs.

## Relevant areas

- apps/desktop/tauri/src/organization/upgrade/ (mod.rs, command.rs), the workspace upgrade's pipeline path beside it
- apps/desktop/tauri/src/upgrade/format/runner/

## Constraints

- Signed rows a step writes are signed on the running machine and sent in the one transaction.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- No changeset unless a user can observe it; no organization upgrade step ships yet.
