---
status: open
blocked-by: [09]
---

# feat(organization): a new member starts locked until an owner or a manager unlocks them

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*A new member starts locked*).

## Outcome

The organization database has a signed `member_lock` table. An account an invitation makes, and an account whose password is reset, is locked; `member_unlock` unlocks a member who has set a password, for the owner or an outranking holder of `AssignRole` or `OverrideMember`. Rust refuses a locked actor every organization act but sign-in, sign-out, the password change and reads. Members invited before this change who never set a password are locked by the first machine able to sign the row; everybody else carries over unlocked. The session and the roster say who is locked.

## Acceptance Criteria

Traces requirements 31, 32 (the Rust half), 34 (the Rust half), 35, 36 and 37, and criteria 31, 32 (the Rust half), 34 (the Rust half), 35, 36 and 37.

- [ ] `member_lock` is appended last to `TABLES`/`SCHEMA` (after `organization_name`), completed by `complete_schema`, with no format change; the table-count and format-three structure tests are updated.
- [ ] `Authority::MemberLock { member_id, locked, updated_at }` with its own domain constant and preimage vectors; `covers` answers the root, or a certificate holding `AssignRole` or `OverrideMember` that outranks the member and is not the member's own; re-signed in `re_sign_rows_of_certificates_but`, with a test that a handover leaves it valid.
- [ ] A verifying row reads as it says; a row that does not verify reads locked; no row reads unlocked. Criterion 35's Rust test: an unlocked row written into a replica without a valid signature leaves the member locked.
- [ ] `write_account` writes a locked row beside the member row; the reset (`unset_password`) writes a locked row. Criteria 31 and 37's Rust tests.
- [ ] `member_unlock(member_id)` is a command with a gate-table entry, a router procedure and a host method; it is refused before the member's password is set, for the actor's own id, and for an actor lacking the flags or the rank. Criterion 34's Rust test.
- [ ] Every organization command reached through the actor refuses a locked actor with a new `RefusalReason::Locked` (mapped in the frontend's refusal table with an English and Arabic sentence), except sign-in, sign-out, the password change and reads. Criterion 32's Rust test.
- [ ] Beside `repair_owner_row`, a machine whose member could sign the row writes a locked row for every member with no lock row, no password set and no consumed invitation, and pushes. Criterion 36's Rust test.
- [ ] `SessionFacts` carries `locked` and `MemberStanding` carries `locked`, in Rust and TypeScript, with every fixture building the new field.
- [ ] A changeset.

## Relevant areas

- `apps/desktop/tauri/src/organization/{authority/preimage.rs,authority/chain.rs,store/mod.rs,store/signature.rs,store/member.rs,invitation/account.rs,invitation/mod.rs,invitation/roster.rs,ownership/repair.rs,session/mod.rs,role/permission.rs,mod.rs}`, `tauri/src/error.rs`
- `apps/desktop/src/lib/organization/{host.ts,tauri.ts,router.ts}`, `src/lib/error/tauri.ts`

## Constraints

- [[rules/migrations]]: no format bump; members on older builds keep opening the organization (they ignore the table).
- The override and the mark are the precedents for a signed row about another member; follow them.
- Record writes are not refused here; ticket 14 masks the session's permissions.
