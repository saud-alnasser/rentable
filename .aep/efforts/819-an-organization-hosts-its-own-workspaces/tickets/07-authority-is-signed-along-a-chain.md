---
status: open
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

- [ ] The organization key signs an administrator's signing key as a certificate; an administrator
      signs rows; a verifier checks the row's signature **and** the certificate that authorises it
      **and** that the certificate is not revoked, in that order and with no path that skips the
      last one.
- [ ] A test performs exactly the attack criterion 16 names: a member writes another member's row
      with an altered `role`, and the verifier rejects it. The same test covers an altered
      `public_key` and an altered `certificate_id`, because forging any of the three is the same
      attack wearing a different field.
- [ ] **A row signed by a certificate that was later revoked is rejected**, and a test covers it
      separately from the forged-row test. The plan names the failure mode by name: a client that
      verifies the row and forgets the certificate accepts a revoked administrator.
- [ ] The fields under signature are exactly those the plan lists, and a test fails if a new field
      is added to a signed row without being covered. `sealed_secret_key`, `kdf_salt` and
      `kdf_params` are deliberately **not** signed, and a test pins that too, because it is what
      makes a password change a write a member may perform on a database they hold full access to.
- [ ] The organization's verifying key is an input to verification, never read from the database
      being verified. A test that hands the verifier a database whose stored verifying key was
      swapped still rejects the rows.
- [ ] `ed25519-dalek` is added and justified in the commit.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

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
