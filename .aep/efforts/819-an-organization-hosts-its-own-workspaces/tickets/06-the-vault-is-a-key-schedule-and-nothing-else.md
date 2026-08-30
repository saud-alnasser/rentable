---
status: open
---

# feat(organization): the vault is a key schedule and nothing else

## Outcome

`organization/vault.rs` derives a member key from a password, seals and unseals an X25519 secret
under it, seals a credential to a member's public key, and re-seals everything under a new
password. It is pure functions over bytes: no database, no network, no Turso, no rows. It is built
test-first, alone, while there is nothing else in the diff to look at instead.

## Acceptance Criteria

Traces requirement 9 and requirement 13 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 9 and
criterion 13. The key schedule is given in
[[efforts/819-an-organization-hosts-its-own-workspaces/plan]] under *The key schedule* and is not
restated here.

- [ ] Every operation in the schedule exists and round-trips under test: derive, seal the secret
      key, seal to a public key, unseal, re-seal under a new password.
- [ ] **A wrong password yields no usable key and no distinguishable failure.** The AEAD tag fails
      and that is the whole of it. There is no comparison, no boolean, and no branch a modified
      client could take, which is requirement 9's actual content and criterion 9's test.
- [ ] `kdf_params` is a value the caller passes and the module stores, never a constant compiled in.
      Raising the cost later must be a re-seal on next sign-in rather than a migration, and a
      hard-coded parameter is what makes it a migration.
- [ ] **Argon2id at `m = 256 MiB, t = 3, p = 1` is measured on real hardware and the number is
      written into the ticket**, on the slowest machine available. If it is unusable the parameters
      move, and moving them weakens the only defence this design has, so the trade is recorded
      here rather than discovered at sign-in.
- [ ] A test asserts that **no key held by one member opens another member's sealed secret key**.
      This is what stops an escrow copy arriving later as a convenience, which the spec forbids
      under *Constraints* and requirement 13 settles.
- [ ] Test vectors are fixed rather than generated: a known password, a known salt, and a known
      ciphertext checked in, so a dependency upgrade that silently changes an algorithm fails the
      suite instead of re-deriving a different answer and passing.
- [ ] The new dependencies are `argon2`, `chacha20poly1305`, `x25519-dalek` and `hkdf`, each
      justified in the commit. `sha2`, `base64`, `rand` and `keyring` are already in the manifest.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

## Relevant areas

`apps/desktop/tauri/src/organization/` is new. `apps/desktop/tauri/Cargo.toml` gains four
dependencies; #817 removed four that nothing imported, so each of these is justified at the point
it is added.

`apps/desktop/tauri/src/sync/google/auth.rs::random_url_safe_token` and
`OAUTH_TOKEN_ENTROPY_BYTES` show how this repository already draws random bytes, and whatever this
module uses should not be a second answer to that question.

## Constraints

- **This module knows nothing about rows, Turso, or the organization.** A module that answered both
  "can this password open this" and "is this row telling the truth" would let a reviewer check one
  and believe they had checked both. The chain is ticket 07 and stays separate.
- **Test-first, and the tests are the deliverable as much as the code is.** The spec's second risk
  is that this is wrong in a way that reviews well, and it shows up as nothing at all until
  somebody competent looks.
- **No key crosses to TypeScript** ([[rules/credentials]], *Client boundary*).

## Notes

Nothing gates this. It is one of three tickets that can start immediately, and it is deliberately
independent of the consent question so the cryptographic work is not waiting on a browser.

A written threat model belongs with this ticket rather than after it. The spec's second risk names
it as the mitigation and the plan agrees; a threat model produced once the code exists is a
description of the code.
