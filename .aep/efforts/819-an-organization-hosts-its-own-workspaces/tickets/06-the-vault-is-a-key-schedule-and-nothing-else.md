---
status: resolved
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

- [x] Every operation in the schedule exists and round-trips under test: derive, seal the secret
      key, seal to a public key, unseal, re-seal under a new password.
      *Verified: all six round-trip under test, the five the outcome names and the invitation seal the plan's schedule also lists, over 29 tests. Built test-first: the interface went in with unimplemented bodies and all 29 were watched failing before a line of it existed.*
- [x] **A wrong password yields no usable key and no distinguishable failure.** The AEAD tag fails
      and that is the whole of it. There is no comparison, no boolean, and no branch a modified
      client could take, which is requirement 9's actual content and criterion 9's test.
      *Verified: over the shipping half of the file, lines 1 to 603, there is no `==`, no `!=`, no function returning `bool` and no stored verifier. Every unseal failure returns one shared `unopenable()` carrying one fixed message, and a wrong password, a tampered ciphertext, a truncated one, another member's key and a low-order curve point all reach it.*
- [x] `kdf_params` is a value the caller passes and the module stores, never a constant compiled in.
      Raising the cost later must be a re-seal on next sign-in rather than a migration, and a
      hard-coded parameter is what makes it a migration.
      *Verified: `KdfParams` has no `Default` and no constant, and the shipping half holds no cost literal at all. `a_vault_opens_at_the_cost_it_was_sealed_at_rather_than_a_current_one` is the test.*
- [x] **Argon2id at `m = 256 MiB, t = 3, p = 1` is measured on real hardware and the number is
      written into the ticket**, on the slowest machine available. If it is unusable the parameters
      move, and moving them weakens the only defence this design has, so the trade is recorded
      here rather than discovered at sign-in.
      *Verified: measured on an AMD Ryzen 9 9950X at 257, 258 and 273 ms in release against 4.71 s unoptimized, recorded above under *The Argon2id measurement* with the caveat that this is the fastest machine here rather than the slowest. The parameters stand and nothing moved.*
- [x] A test asserts that **no key held by one member opens another member's sealed secret key**.
      This is what stops an escrow copy arriving later as a convenience, which the spec forbids
      under *Constraints* and requirement 13 settles.
      *Verified: `no_key_one_member_holds_opens_another_members_sealed_secret_key` tries every key anybody ever holds against a vault they did not build, and `a_credential_sealed_to_one_member_does_not_open_for_another` covers the grant.*
- [x] Test vectors are fixed rather than generated: a known password, a known salt, and a known
      ciphertext checked in, so a dependency upgrade that silently changes an algorithm fails the
      suite instead of re-deriving a different answer and passing.
      *Verified: five vectors are checked in and four were computed outside this crate: OpenSSL 3.5.7 for the member key and the key agreement, RFC 5869 for the expansion, RFC 7748 for x25519, and a standalone XChaCha20-Poly1305 checked against RFC 8439. Mutating `Argon2id` to `Argon2i` and dropping the public key from the associated data each failed exactly three tests, and 26 of the 29 passed under both, which is why round trips alone would have shipped both defects.*
- [x] The new dependencies are `argon2`, `chacha20poly1305`, `x25519-dalek` and `hkdf`, each
      justified in the commit. `sha2`, `base64`, `rand` and `keyring` are already in the manifest.
      *Verified: all four are justified in the commit and again where each is added in `Cargo.toml`. This criterion's own parenthetical is wrong and is left as written: the crate already in the manifest is `getrandom` 0.4.3 rather than `rand`, and it is what this module draws bytes through. Nothing was added for it and nothing is missing.*
- [x] `cargo test`, `cargo clippy` and the repository's gates pass.
      *Verified: `cargo test` 184 passed, 0 failed, 4 ignored. `cargo fmt --check` clean. `cargo clippy --all-targets` five warnings, every one pre-existing and none in `src/organization/`. `pnpm check`, `pnpm exec eslint .` and `pnpm test` (4 of 4 tasks) pass, and `189 artifacts checked, no failures`.*

## The Argon2id measurement

Measured 2026-08-30 on an AMD Ryzen 9 9950X, 16 cores, Windows 11, deriving a 32-byte member key
at `m = 256 MiB, t = 3, p = 1` with `argon2` 0.6.0.

| Build | Per derivation, three runs |
| --- | --- |
| release | 257 ms, 258 ms, 273 ms |
| development, with `argon2` at `opt-level = 3` | 253 ms, 262 ms, 263 ms |
| development, unoptimized | 4.71 s |

**The parameters stand and nothing moves.** A quarter of a second is a sign-in. It is paid once
when a member signs in and once when they change their password, and nowhere else.

**The unoptimized row is why `[profile.dev.package.argon2] opt-level = 3` is in the manifest.**
Without it a developer waits five seconds at every sign-in against a debug build, and the test
that proves the cost is usable measures the build profile instead of the cost. The two optimized
rows agreeing is what says the override makes the two profiles equivalent for this function.

**This is the fastest machine available rather than the slowest, so the number is a floor**, and
that is said plainly rather than dressed up: there is one machine here. A low-end laptop four
times slower still lands near a second, which is a sign-in rather than a wait, and what the
parameter is really buying is the 256 MiB an attacker needs per parallel guess rather than the
time. If a machine somebody actually uses measures somewhere that reads as a wait, that is the
moment to reopen the trade, and it is the orchestrator's to reopen: lowering `m` is the change
that weakens the only defence this design has, while lowering `t` costs proportionally less.

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
