---
status: resolved
---

# fix(organization): a spent link is refused before anything is recorded

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*Links are spent before anything is recorded*).

## Outcome

Opening an invitation link or a machine link a second time, on the machine that used it or on any other, is refused as already used before the machine's record, the registry or the remembered keys change, and the replica file the link pulled is deleted. The refusal tells the person to ask the owner or a manager for a new link. This lands on today's single-organization shape.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [x] `join::accept` judges the invitation's standing (lapsed, consumed, revoked) and the removed-member check on the store reached with the link's credential, reading invitations under `JoinLink::verifying_key_bytes`, before `connect::connect`; `connect::connect` runs only after the vault opens.
- [x] `leave_no_replica` moves out of `organization/setup/mod.rs` to a place `invitation/join.rs`, `invitation/machine.rs` and setup all reach; every refusal after the replica was pulled goes through it, with the store dropped first.
- [x] Rust tests, for an invitation link and for a machine link: used once, then opened again on the same machine and on a machine holding nothing; each second opening is refused with `RefusalReason::Consumed`, `remote-sync.json` is byte-for-byte unchanged, no remembered key is written, and no `org-*.db` file is left on the machine that held nothing.
- [x] The connect screen's consumed branch (`wasConnecting`, "go to the sign-in") is retired; a consumed link reads one sentence saying the link was already used and to ask the owner or a manager for a new one, in English and Arabic; `connect-screen.svelte.test.ts` and `organization/setup/tests/connect.test.ts` are updated.
- [x] A changeset.

## Relevant areas

- `apps/desktop/tauri/src/organization/invitation/{join.rs,machine.rs,connect.rs,command.rs}`
- `apps/desktop/tauri/src/organization/setup/mod.rs` (`leave_no_replica`)
- `apps/desktop/src/lib/organization/setup/{connect.ts,component/connect-screen.svelte}`, `organization/i18n/{en,ar}.ts`

## Constraints

- While a machine holds an organization, a link for that same organization must never delete its replica: until ticket 07 lands the short-circuit, the cleanup runs only where the machine holds no organization or another one ([[rules/data]]).
- [[rules/credentials]]: nothing about the refused link's credential is kept.
