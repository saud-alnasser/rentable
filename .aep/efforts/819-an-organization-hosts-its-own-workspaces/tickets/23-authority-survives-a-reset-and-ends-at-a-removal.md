---
status: open
blocked-by: []
---

# fix(organization): authority survives a reset and ends at a removal

## Outcome

Resetting an administrator no longer orphans the rows they signed, removing an administrator ends
their authority over the organization database rather than leaving it live, and a removed member's
replayed rows earn them no fresh credential. These are the three defects the effort's own review
found in the certificate and revocation model (F1, F2, F3), which requirement 13's *Why* and the
spec's risk 4 both anticipated: a key schedule that reviews well and is broken anyway.

## Background

An administrator's signing key and the owner's organization key are derived from the vault secret
(`vault::MemberSecretKey::derive_seed`). A reset draws a fresh secret, so the derived key changes,
and `invite::reissue_invitation` -> `issue` writes a new certificate under the same `cert-{member_id}`
id (`store::write_certificate` is INSERT-OR-REPLACE). Every row that administrator previously signed
still names `cert-{member_id}` and was signed by the old key, so `authority::verify` now fails them,
and `store::members`/`grants`/`invitations` refuse the whole read on the first bad row. Result: after
`member_reset` of an administrator, no member, **including the owner**, can sign in.

Removal (`removal::remove_member`) re-signs the member row as `removed` and deletes their grants, but
never revokes a removed administrator's certificate (`Certificate::revoked` has no shipping caller)
and never rotates the organization database credential (deliberately, for restore). Authority
payloads carry no nonce or issue time, so a removed member who still holds the organization
credential can write their old, validly-signed grant rows back, and `workspace::renew_credentials`
(no role filter) re-seals a fresh credential to them at the owner's next renewal. A removed
administrator, whose certificate is not revoked, can author new verified rows outright.

## Acceptance Criteria

Traces requirement 13, requirement 14 and requirement 16 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 13 and criterion 14.

- [ ] **Resetting an administrator leaves every row they signed still verifiable, and everyone can
      still sign in.** Before the certificate changes, the rows it signed are re-signed under the
      resetter's own certificate (the resetter has authority over all of them), so no row is left
      naming a key that no longer exists. A test resets an administrator who has invited a member
      and granted a workspace, then signs in as the owner, as the reset administrator under the new
      password, and as the member, and reads members, grants and invitations without a refusal.
- [ ] **Removing an administrator ends their authority.** Their certificate is revoked, and the
      rows it signed are first re-signed under the remover's certificate so revoking it bricks
      nothing. A test removes an administrator who signed rows, then shows a row that administrator
      newly signs after removal is refused by every other client on read, while the rows they had
      legitimately signed still verify.
- [ ] **A removed member earns no fresh credential from a replayed row.** `renew_credentials`
      issues to a grant only where the member's current row is not `removed`. A test writes a
      removed member's old grant row back into the store and shows the next renewal seals them
      nothing.
- [ ] The re-signing is one routine used by reset, removal, and any future revocation, so the three
      cannot drift; `[[efforts/819-an-organization-hosts-its-own-workspaces/plan]]`'s "revoked by one row, nothing resealed" is corrected to say what the
      code does, and the limit (a revocation re-signs the revoked certificate's rows first) is
      recorded in `[[contexts/desktop/organization]]`.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Constraints

- **No escrow key is introduced.** The re-signing is done by an administrator who already holds
  authority over the rows, using their own key; nothing seals one member's signing key to another,
  which requirement 13's *Constraints* forbid.
- **The organization credential is not rotated on an ordinary removal**, because restore and every
  offline member depend on it (requirement 14). Replay is answered by revocation and the renewal
  filter, not by cutting everyone off.
- A changeset is not written: this corrects code added in this same unlanded effort, which ships as
  one minor a user has not seen yet.

## Notes

This is the crypto-critical cluster. Build it test-first, and keep the re-signing routine in one
place (`organization/authority.rs` or `organization/store.rs`) so reset, removal and revocation
share it.
