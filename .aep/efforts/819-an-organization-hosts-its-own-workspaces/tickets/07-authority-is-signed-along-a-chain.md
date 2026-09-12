---
status: resolved
blocked-by: ['06']
---

# feat(organization): authority is signed along a chain

## Outcome

`organization/authority.rs` issues an administrator certificate under the organization key, signs
the authority fields of a row, verifies a row against the chain, and refuses a row signed by a
revoked certificate. It is the only place in the tree where a signature is checked, and like the
vault it is pure functions over bytes.

## Acceptance Criteria

Traces requirement 16 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]] and its
criterion 16. The two-level chain and the fields it covers are given in
[[efforts/819-an-organization-hosts-its-own-workspaces/plan]] under *Authority is signed along a
two-level chain* and *Data model*, and are not restated here.

- [x] The organization key signs an administrator's signing key as a certificate; an administrator
      signs rows; a verifier checks the row's signature **and** the certificate that authorises it
      **and** that the certificate is not revoked, in that order and with no path that skips the
      last one.
      *Verified: `verify` runs the three checks in that order, the row against the key its certificate names, the certificate against the key the caller pinned, then revocation, and the only `Ok` in the function is below the third. `verify_signature` is private, so a caller cannot reach the first check without the other two.*
- [x] A test performs exactly the attack criterion 16 names: a member writes another member's row
      with an altered `role`, and the verifier rejects it. The same test covers an altered
      `public_key` and an altered `certificate_id`, because forging any of the three is the same
      attack wearing a different field.
      *Verified: `a_member_row_rewritten_by_another_member_is_rejected` is exactly that attack and covers all three in one test: the member promotes their own `role`, points the row at a key they hold the secret half of, and points it at another certificate.*
- [x] **A row signed by a certificate that was later revoked is rejected**, and a test covers it
      separately from the forged-row test. The plan names the failure mode by name: a client that
      verifies the row and forgets the certificate accepts a revoked administrator.
      *Verified: `a_row_signed_by_a_certificate_that_was_later_revoked_is_rejected` and `a_revoked_certificate_still_carries_the_signature_it_was_issued_with` are separate from the forged-row test, and the second is what proves the third check is not the second one in disguise. Deleting the revocation check fails four tests; it was deleted, watched failing, and restored.*
- [x] The fields under signature are exactly those the plan lists, and a test fails if a new field
      is added to a signed row without being covered. `sealed_secret_key`, `kdf_salt` and
      `kdf_params` are deliberately **not** signed, and a test pins that too, because it is what
      makes a password change a write a member may perform on a database they hold full access to.
      *Verified: `MemberAuthority` is `public_key`, `role` and `permissions` with `certificate_id` bound in through the preimage; `WorkspaceAuthority` is the database identity; `GrantAuthority` is the whole of the row. `the_fields_under_signature_are_exactly_the_ones_the_plan_lists` pins the set, and a new field left uncovered is a compile error, `E0027`. `a_members_vault_is_not_under_signature_so_a_password_change_needs_no_administrator` pins the exclusion through the real vault: create, sign, `reseal_vault` under a new password, and the signature still verifies.*
- [x] The organization's verifying key is an input to verification, never read from the database
      being verified. A test that hands the verifier a database whose stored verifying key was
      swapped still rejects the rows.
      *Verified: the key is a parameter of `verify` and nothing in the module reads one from anywhere. `a_database_re_signed_under_another_organization_key_is_still_rejected` is the swapped-key test.*
- [x] `ed25519-dalek` is added and justified in the commit.
      *Verified: justified in the commit and again where it is added in `Cargo.toml`, on the ground that `curve25519-dalek` 5 is already compiled here for the vault, so this is the same family over the same field rather than a second curve to review.*
- [x] `cargo test`, `cargo clippy` and the repository's gates pass.
      *Verified: `cargo test --manifest-path ./tauri/Cargo.toml -- --test-threads=1` reports 230 passed, 0 failed, 4 ignored. `cargo fmt --check` clean, `cargo clippy --all-targets` the same five pre-existing warnings and none in this module, `pnpm check`, `eslint` and `pnpm test` (4 of 4) pass, and 189 artifacts validate.*

## Relevant areas

`apps/desktop/tauri/src/organization/authority.rs` is new, beside `vault.rs` from ticket 06.

`packages/workspace-permission/index.ts` already holds the authority vocabulary: `Role`,
`ADMINISTRATION`, `ADMINISTRATION_BY_ROLE`, `maskOf`, `permits`, and `HIGHEST_USABLE_BIT`. The
`role` and `permissions` this ticket signs are that vocabulary's, and the package is unchanged by
this effort.

## Constraints

- **Verification has one implementation and every reader goes through it.** A second verifier
  written for convenience at a call site is how the revoked-certificate case gets forgotten.
- **This module knows nothing about passwords.** The vault is ticket 06 and stays separate, for the
  reason that ticket records.
- **What this cannot stop is deletion.** A member who can write the organization database can
  destroy rows they cannot forge, and nothing available prevents that. It is recorded under
  *Operational considerations* in the plan and answered by Turso's point-in-time restore, which
  belongs to the customer's account. Do not invent an append-only log here.

## Notes

Gated on ticket 06 for the shared files rather than for the cryptography: both add dependencies to
`apps/desktop/tauri/Cargo.toml` and both land under a new `organization/` module tree, and two
agents writing those concurrently collide. There is no algorithmic dependency between them.
