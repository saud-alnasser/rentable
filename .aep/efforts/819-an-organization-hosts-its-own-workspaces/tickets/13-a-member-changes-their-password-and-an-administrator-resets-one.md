---
status: resolved
blocked-by: ['12']
---

# feat(organization): a member changes their password and an administrator resets one

## Outcome

A member changes their own password, which re-seals their own credentials and touches nobody
else's row. An administrator resets a password they do not know by reissuing the member a fresh
vault from credentials the administrator already holds, and the call says which workspaces the
administrator could not restore. No key anywhere opens a vault its holder did not build.

## Acceptance Criteria

Traces requirement 10, requirement 13 and requirement 21 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 13 and
criterion 21.

- [x] A password change re-seals the member's own credentials and leaves every other member's row
      **byte-identical**, asserted rather than argued.
      *Verified: `organization/password.rs::change_password` re-seals the session's own secret key
      under the new password with `vault::reseal_vault` and writes it through
      `store::reseal_member`, an unsigned `UPDATE` of `sealed_secret_key`, `kdf_salt`,
      `kdf_params`, `must_change_password` and `updated_at` on one row, refused if the public key
      would change. Every credential is sealed to the public key, which does not move, so no grant
      is touched. `a_password_change_touches_the_members_own_vault_and_no_other_row` reads every
      cell of every table before and after, asserts exactly one row differs, that it is the member's
      own, and that within it the id, email, name, public key, sealed content key, role,
      permissions, certificate, signature and `created_at` are byte-identical while the sealed
      secret key, the salt and the flag changed; then signs in with the new password, finds both
      grants, and finds the old password dead.*
- [x] An administrator's reset restores a member's access without the administrator learning the
      member's previous password, and without the member's previous password being needed.
      *Verified: the reset is `invite::reissue_invitation`, now behind the `member_reset` command:
      a fresh vault under a fresh generated password, the content key and every grant the
      resetting administrator holds a full credential on re-sealed to it, and a fresh invitation.
      It takes the member's id and nothing about their old vault;
      `a_reset_restores_what_the_administrator_reaches_and_names_what_they_do_not` has an
      administrator who never knew the member's password reset them, and the member sign in with
      the generated password and hold the workspace the administrator reaches.*
- [x] **A test asserts that no key an administrator holds opens a vault that administrator did not
      build.** This is what stops an escrow copy arriving later as a convenience, which the spec
      forbids under *Constraints* and which requirement 13 settles by making reset a reissue.
      *Verified: `no_key_an_administrator_holds_opens_a_vault_they_did_not_build` takes every
      thirty-two-byte value the owner and an administrator hold, their X25519 secret, the content
      key, their public key, the organization key seed and the administrator key seed derived from
      their secret, and the verifying key, and tries each as a member key against every other
      member's vault before and after that member changed their password; and tries their secret
      against every other member's sealed content key. None opens. `MemberKey::from_bytes` and
      `open_sealed_secret_key` are exposed to the test alone for it.*
- [x] `member_reset` returns `unreachable_workspaces`: the workspaces the resetting administrator
      cannot reach themselves and therefore cannot restore. Requirement 13 states this limit and
      the plan puts it at the call rather than leaving the member to discover it.
      *Verified: `reissue_invitation` splits the member's grants by whether the resetting
      administrator holds a full credential on the workspace: the reachable ones are re-sealed to
      the fresh vault, the rest are deleted (`store::delete_grant`, because a grant sealed to a
      vault that is gone is a sign-in that fails) and returned as
      `Invited.unreachable_workspaces`, id and name. The test above has an administrator holding
      North and not South reset a member holding both, asserts the answer names South, that the
      member signs in holding North and not South, and that the owner grants South again with
      nothing but the public key. The dashboard's result panel draws the list in a warning callout,
      and `invite-form.svelte.test.ts` asserts it is present on a reset and absent on an invite.*
- [x] A member may choose their own password at first change, subject to a strength floor checked
      on the machine, and a password below the floor is refused. The interface says why the floor
      exists rather than showing a meter: there is no server to slow an attacker down and the
      password is the whole defence.
      *Verified: the floor is the first run's, `setup::MINIMUM_PASSWORD_LENGTH` (12), checked in
      `change_password` before any derivation and again in the router's `password.change` input
      and the form's submit gate;
      `the_floor_and_the_current_password_are_both_checked_before_anything_is_written` has a
      password one under the floor refused as `InvalidInput` and a wrong current password refused,
      with every row byte-identical afterwards. `change-password-form.svelte` shows
      `organization.setup.passwordFloor`, the sentence saying there is no server to slow a guess
      down, under the new-password field, and `change-password.svelte.test.ts` asserts the sentence
      is there and no meter or progress element is.*
- [x] Clearing `must_change_password` is what ends ticket 12's requirement to change, and a member
      who has not cleared it still reaches nothing else.
      *Verified: `reseal_member` writes the flag false in the same statement as the vault, and the
      session's copy is cleared with it. Before that, `MemberSession::settled` refuses every act
      that reads it, opening a workspace included (`workspace_open`), so the shell reaches nothing;
      on the web side `sync/admission.ts` answers `passwordChangeRequired` for such a session, the
      startup unit draws the `change-password` state over every address (`shell-surface.test.ts`),
      opens no workspace and runs no bootstrap (`startup.test.ts`, the 4c group), and
      `changePassword` goes on in only once the shell answers with the flag cleared. The join test
      now stops at the password and goes on after it.*
- [x] Both locales, both directions.
      *Verified: `account.password.*`, `layout.changePassword.*`,
      `organization.dashboard.resetPassword` and `organization.dashboard.unreachableWorkspaces`
      (with a `{workspaces}` parameter) in `en/index.ts`, `ar/index.ts` and the generated
      `i18n-types.ts`; `pnpm check` 0 errors. The startup screen is rendered in Arabic in
      `change-password.svelte.test.ts` with the same three fields.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` clean; `pnpm test`
      904 node tests and 36 component tests pass; `vite build` builds. `cargo test
      --test-threads=1` 325 passed, 0 failed, 8 ignored; `cargo clippy --all-targets` the same five
      warnings that stand at the branch point, none in `organization/`; `cargo fmt --check` clean.*

## Relevant areas

`apps/desktop/tauri/src/organization/vault.rs` from ticket 06 already has re-seal; this ticket is
what calls it and what decides which rows change.

`organization/store.rs` from ticket 08: `sealed_secret_key`, `kdf_salt` and `kdf_params` on
`member` are deliberately unsigned, which is exactly what makes a password change a write a member
may perform on a database they hold full access to. Ticket 07 pins that.

`apps/desktop/src/lib/organization/` holds both surfaces: the member's own change, and the
administrator's reset in the dashboard from ticket 11.

## Constraints

- **No escrow, no organization-wide unlocking key, no exceptions.** The spec's constraint says a
  design that introduces one is a different effort with a different threat model, and that it must
  not arrive as a convenience during implementation. The test above is what enforces it.
- **[[rules/credentials]], *Client boundary*.** Old and new passwords go to a Rust command. Nothing
  comes back but an outcome and the unreachable list.
- **A reset is signed** by the administrator performing it, under ticket 07's chain.

## Notes

The limit is worth stating to the human in review, because it will read as a bug the first time it
bites: a member locked out of a workspace that no present administrator belongs to waits for one
who does. That is the price of there being no master key, and the spec accepted it deliberately.

The risk about generated passwords is answered here. The spec's fourth risk is that an
administrator replaces a generated password with something they can say over the phone; permitting
a chosen password with a floor is the answer it settled on, because a password nobody can remember
is written on a note beside the machine.
