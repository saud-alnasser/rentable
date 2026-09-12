---
status: resolved
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

- [x] **Resetting an administrator leaves every row they signed still verifiable, and everyone can
      still sign in.** Before the certificate changes, the rows it signed are re-signed under the
      resetter's own certificate (the resetter has authority over all of them), so no row is left
      naming a key that no longer exists. A test resets an administrator who has invited a member
      and granted a workspace, then signs in as the owner, as the reset administrator under the new
      password, and as the member, and reads members, grants and invitations without a refusal.
      *Verified: `organization::invite::tests::resetting_an_administrator_leaves_every_row_verifiable_and_everyone_signs_in`.
      The owner resets an administrator who holds a workspace and has invited a member; without the
      re-sign the members read is bricked (the test failed on exactly that line before the fix,
      which is F1), and with it members, grants and invitations all read, the owner, the reset
      administrator under the new generated password, and the invited member all sign in, and the
      old password no longer opens the reset administrator's vault. The re-sign is
      `invite::issue`'s call to `store::re_sign_rows_of_certificate` before `write_certificate`.*
- [x] **Removing an administrator ends their authority.** Their certificate is revoked, and the
      rows it signed are first re-signed under the remover's certificate so revoking it bricks
      nothing. A test removes an administrator who signed rows, then shows a row that administrator
      newly signs after removal is refused by every other client on read, while the rows they had
      legitimately signed still verify.
      *Verified: `organization::removal::tests::removing_an_administrator_revokes_their_certificate_and_re_signs_what_they_signed`.
      An administrator invites a member, then is removed; the test asserts their certificate now
      carries `revoked_at` (it failed on that assertion before the fix, which is F2), that members,
      grants and invitations still read and the invited member still signs in and holds the
      workspace, and that a self-promotion row the removed administrator writes under their revoked
      certificate is refused on read naming their id and the revocation. The revoke and re-sign are
      `removal::remove_member`'s call to `store::re_sign_rows_of_certificate` then
      `write_certificate(..revoked)`.*
- [x] **A removed administrator's re-inserted rows are refused, and the replay that earns a
      credential is closed by ticket 24's renewal filter, which this ticket depends on for the
      whole of F2.** This ticket revokes the certificate; ticket 24 stops a replayed grant earning
      a credential. Neither closes F2 alone.
      *Verified for this ticket's half: the removal test above shows a row a removed administrator
      newly signs under their now-revoked certificate refused on read. The credential-replay half
      is ticket 24's renewal filter and is left to it, as the criterion says; `workspace::renew_credentials`
      is unchanged here.*
- [x] The re-signing is one routine used by reset, removal, and any future revocation, so the three
      cannot drift; `[[efforts/819-an-organization-hosts-its-own-workspaces/plan]]`'s "revoked by one row, nothing resealed" is corrected to say what the
      code does, and the limit (a revocation re-signs the revoked certificate's rows first) is
      recorded in `[[contexts/desktop/organization]]`.
      *Verified: the one routine is `store::re_sign_rows_of_certificate`, called by both
      `invite::issue` (reset) and `removal::remove_member` (removal), and it refuses to re-sign a
      certificate's rows onto itself; `organization::store::tests::re_signing_a_certificates_rows_lets_it_be_retired_without_bricking_them`
      signs one of every kind of row (member, workspace, grant, invitation) under a certificate,
      shows a bare revocation bricks the read (F3), then re-signs all four under the owner and shows
      the same revocation bricks nothing while a fresh row under the retired certificate is still
      refused. `plan.md`'s two-level-chain row and `contexts/desktop/organization.md`'s *Chain* and
      removal boundary are updated.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: in `apps/desktop/tauri`, `cargo test -- --test-threads=1` reports 277 passed, 0
      failed, 10 ignored, stable across three consecutive runs; `cargo clippy --all-targets` adds no
      warning to the 5 pre-existing (settings.rs, sync/store.rs, database/version.rs, database/mod.rs
      x2), none in the changed files; `cargo fmt --check` is clean. In `apps/desktop`, `pnpm check`
      reports 0 errors, `pnpm lint` is clean, `node --import tsx --test ...` reports 893 passed 0
      failed, and `pnpm exec vitest run` reports 45 passed. `pnpm test` through turbo does not run in
      this worktree, so the desktop's own runners were invoked directly, as the brief directs.*

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
