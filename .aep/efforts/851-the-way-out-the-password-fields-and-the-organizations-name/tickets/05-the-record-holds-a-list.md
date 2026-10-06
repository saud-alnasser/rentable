---
status: resolved
---

# refactor(sync): the machine's record holds a list of organizations

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The machine's record holds a list, and still writes the old key*).

## Outcome

`remote-sync.json` holds `heldOrganizations` and `selectedOrganization`, still writes `organization` as a copy of the selected entry, and a record written by the current release is converted in place at load with nothing forgotten. Replica entries carry their organization's id, each held entry its own Turso organization and last workspace, and opening a workspace never judges another organization's replica. Behaviour with one organization is unchanged; nothing yet adds a second.

## Acceptance Criteria

Traces requirement 16 and criterion 16 (the record half; the keyring half is ticket 06).

- [x] **First, test-first**: a frozen fixture of a current-release `remote-sync.json` (one organization with `machineId`, `memberId`, `role`, `format`, `machineSignedOut`, `tursoOrganization`, two `replicas`, a `workspace` with `remoteId`) is checked in beside the record's tests, with a failing test that loads it and asserts the converted shape.
- [x] `RemoteSyncStore` carries `held_organizations` (`heldOrganizations`) and `selected_organization`; `HeldOrganization` carries `turso_organization`, `workspace_id` and `name_signed` (all `serde(default)`); `LocalReplica` carries `organization_id`.
- [x] `sanitize` converts: one `organization` and an empty list become a list of one, selected; the top-level `turso_organization` moves into it; every replica entry with no organization takes its id. Each entry is sanitized as `organization` is today. The key `organizations` is never written.
- [x] Every commit writes `organization` as the selected entry (or nothing); a test reads a converted record back with only the fields an older build knows and finds the selected organization intact.
- [x] Every reader and writer of `.organization` and the top-level `turso_organization` that the evidence lists goes through the list by id or through the selected entry; behaviour with one organization is unchanged and the Rust suite passes.
- [x] `workspace::open`'s `organization_standing` skips a workspace whose replica entry names another organization; a Rust test with replica entries for two organizations shows the other's file is not released.
- [x] `upgrade/shape.rs` still forgets the pre-2026-09-13 shape and never mistakes `heldOrganizations` for it; its tests pass, with one added for the new key.

## Relevant areas

- `apps/desktop/tauri/src/machine/record.rs`, `tauri/src/persisted.rs`, `tauri/src/upgrade/shape.rs`
- the readers and writers listed in the plan's evidence: `organization/{invitation,ownership,session,setup,workspace}/`
- `organization/workspace/open.rs` (`organization_standing`, `release_replica`)

## Constraints

- [[rules/migrations]] and [[contexts/repository]], *Constraints*: the application has users; nothing is reset to land this.
- No command signature changes here; ticket 07 adds select and remove.
- [[skills/tdd]] for the fixture.
