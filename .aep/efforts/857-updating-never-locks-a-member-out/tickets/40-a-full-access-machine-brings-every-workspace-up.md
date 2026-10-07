---
status: open
---

# fix(organization): a full-access machine brings every workspace up, so readers barely wait

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found by the review of the reopened work: `0008` adds columns every read names, so a member with a read-only grant cannot open a workspace still behind it until a full-access member opens that workspace on this build, which made ticket 37 inert on real data. A reader needs the columns and cannot add them, so the wait is shrunk instead: after sign-in, a machine on this build with full access brings every workspace it may write up to date in the background, and a reader meanwhile meets the workspace-held screen saying it waits for someone with full access to open it on the new version.

## Acceptance Criteria

Traces requirement 1, requirement 7 and criterion 1.

- [ ] After a sign-in, resume or heartbeat on this build, each workspace the member holds with full access and that is behind steps it may apply is brought up in the background, one at a time, under the lease, without opening it in the interface and without slowing the open workspace; a failure is logged and retried on a later beat; tests.
- [ ] A member with a read-only grant whose workspace is behind a step a reader needs meets the workspace-held screen with a reason saying it is waiting for someone with full access to open it on the new version, in Arabic and English, with the other workspaces reachable; never a generic failure; a test.
- [ ] Ticket 37's tests are complemented by one on the shipped ladder (pending `0007` and `0008`) showing the reader's screen, and one showing the reader opens once a full-access machine has brought the workspace up.

## Relevant areas

- apps/desktop/tauri/src/organization/session/ (heartbeat, sign-in), organization/lease/
- apps/desktop/src/lib/startup/ (workspace-held), i18n

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say why in Notes if none.
