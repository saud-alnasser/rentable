---
use-when: "building a ticket in this effort and the approach is not obvious from the spec"
---

# Architecture

**The organization database is a replica like any workspace, and a member's authority is what
their password unlocks inside it.**

Three decisions carry the whole approach. Each was put to the human on 2026-08-30 with its
alternatives, and each was delegated back on one criterion, most secure and most usable.

## The credential reaches a member as a sealed grant

Every member holds an X25519 keypair. The secret half is sealed under a key derived from their
password; a workspace credential is sealed *to the public half*. **An administrator can therefore
grant a workspace to a member whose password they do not know**, which is the property the whole
design turns on and the reason a symmetric scheme cannot be used here: sealing symmetrically would
require the sealer to hold the member's password at every later grant, so a member could never be
added to a second workspace after joining.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Sealed vault** (taken) | member is autonomous; later grants need no password; offline sign-in falls out of the replica | real cryptographic plumbing, written once and load-bearing forever | a key-schedule defect passes every test and is invisible until somebody competent looks | the parameters are data in a column, so raising them is a re-seal rather than a migration |
| Owner's machine brokers | nothing sealed, nothing stored, smallest surface | owner must be reachable whenever any credential expires | one laptop becomes the service the effort exists to not run | trivial, but the availability problem is permanent |
| Long-lived keyring credential | simplest by a wide margin | a second machine needs a fresh invitation | requirement 6 fails outright | nothing to maintain and nothing to recover |

## Authority is signed along a two-level chain

Turso mints whole-database credentials, so every member who can write `organization.db` can write
every row of it. **Signatures are what make requirement 16 true, and Turso cannot do it.**

The organization key signs each administrator's key as a certificate. Each administrator signs the
member rows, grants and workspace records they create. A client verifies the chain against the
organization's verifying key, which arrives pinned in the join link and is stored locally, never
read from the database it protects.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Two-level chain** (taken) | a compromised administrator is revoked by deleting one certificate; nothing is resealed and no join link changes | two key kinds and a verification order to get right | a client that verifies the row and forgets the certificate accepts a revoked administrator | revocation is a row, which is the cheapest kind of maintenance there is |
| One shared org key | one key, one verification step | compromise means replacing the key, resigning every row, and reissuing every join link, because the pinned verifying key changed | the recovery is so expensive it will be deferred, which means running compromised | cheap until the day it is not |
| Owner key only | smallest blast radius available | an administrator cannot create a member row without the owner present | requirement 12's delegated administration becomes decorative | least to build, most to operate |

**A member can still delete or corrupt rows they cannot forge.** Nothing available stops that; the
answer is Turso's point-in-time restore, which belongs to the customer's account. It is recorded
under *Operational considerations* rather than designed around, because designing around it means
inventing an append-only log on top of a database that has no compare-and-set.

## A migration is applied by whichever client notices, under a lease

`0003` drops and renames tables, which a sync connection cannot carry (measured 2026-08-20 by
#552). So a migration reaches a workspace database over the wire, and
`database/test/workspace.rs::apply_schema_remotely` already does exactly this against
`https://{host}/v2/pipeline`. It is promoted from `#[cfg(test)]` to shipping code rather than
written again.

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Any member, under a lease** (taken) | no machine is special; an organization whose owner is away still upgrades | a lease with an expiry, and two clients racing for it | a lease that leaks leaves a workspace unupgradable until it expires | the lease is a row with a deadline, inspectable by a human |
| Owner's machine only | one writer, so no lease and no race | every member waits for the owner to launch the application | on a small team that is days of everybody blocked | nothing to maintain, plenty to explain |
| Only when asked | nothing surprising happens to a live ledger | an organization that never presses it stops receiving fixes silently | the failure is invisible by construction | a support burden with no signal behind it |

## What is reused rather than built

**The consent flow already exists.** `sync/session.rs::begin_google_sign_in` binds
`TcpListener::bind("127.0.0.1:0")`, builds a PKCE authorization URL, opens the browser through
`tauri-plugin-opener`, and settles the session from a thread handling the loopback callback. Every
generic part of it is already separate in `sync/google/auth.rs`: `random_url_safe_token`,
`pkce_challenge`, `build_authorization_url`, `authorization_code_form`, `parse_token_response`,
`parse_http_request_path`, `parse_query_map`.

**So requirement 3 is a re-parameterisation of working code, not new machinery.** What is genuinely
unknown is Turso's side of it, and that is the effort's load-bearing assumption rather than
anything here.

# Components

| Component | Becomes responsible for |
| --- | --- |
| `apps/desktop/tauri/src/sync/oauth/` | the provider-agnostic PKCE and loopback core, lifted out of `sync/google/auth.rs` unchanged in behaviour |
| `apps/desktop/tauri/src/sync/turso/consent.rs` | the Turso authorization code flow, the scope set requested, and the platform token's home in the OS keyring |
| `apps/desktop/tauri/src/sync/turso/platform.rs` | the Platform API calls, ported from `apps/control-plane/src/workspace/turso.ts` and keeping its port shape so tests answer in memory |
| `apps/desktop/tauri/src/organization/vault.rs` | the key schedule: derive, seal, unseal, re-seal. Knows nothing about Turso or about rows |
| `apps/desktop/tauri/src/organization/authority.rs` | the certificate chain: sign, verify, revoke. The only place a signature is checked |
| `apps/desktop/tauri/src/organization/store.rs` | the organization replica, its schema, and the queries over it |
| `apps/desktop/tauri/src/organization/migrate.rs` | the lease, and applying migrations over `/v2/pipeline` |
| `apps/desktop/tauri/src/database/mod.rs` | a third `Engine` arm is **not** added; the organization replica is a second `turso::sync::Database` held beside the workspace engine, because `Engine` answers *what is the workspace open as* and an organization is not a workspace |
| `packages/workspace-permission` | unchanged. `ADMINISTRATION`, `ADMINISTRATION_BY_ROLE` and `Role` are already the vocabulary |
| `packages/workspace-migrations` | unchanged. It already carries the SQL for both callers |
| `packages/turso-platform` | where `apps/control-plane/`'s Platform API knowledge lands so requirement 20 keeps a hosted tier possible. **TypeScript, and not on the credential path** |
| `apps/desktop/src/lib/organization/` | the web layer: the setup walk, the join screen, sign-in, the administration dashboard |
| `apps/desktop/src/lib/sync/admission.ts` | rewritten. Its three reasons are replaced by the organization's own |

**The vault and the authority chain are separate modules on purpose.** One answers *can this
password open this*, the other answers *is this row telling the truth*, and a module that answered
both would let a reviewer check one and believe they had checked both.

# Interfaces

Everything below is Rust behind Tauri commands. **No key, token, or password crosses to
TypeScript** ([[rules/credentials]], *Client boundary*); the web layer sees outcomes and facts
about credentials, never credentials.

```
organization_consent_begin()            -> { session_id, authorization_url }
organization_consent_result(session_id) -> { status, organizations: [{ slug, is_personal }] }
organization_create(name, slug)         -> { organization_id, join_link }
organization_join(link, email, password)-> { organization_id, must_change_password }
organization_sign_in(org_id, email, password) -> { member_id, role, permissions, workspaces }
organization_change_password(old, new)  -> ()
organization_list()                     -> [{ id, name, email, last_signed_in_at }]

member_invite(email, display_name, role, workspace_ids)
                                        -> { join_link, generated_password }
member_reset(member_id)                 -> { generated_password, unreachable_workspaces }
member_remove(member_id, lock_out: bool)-> { others_must_reconnect: bool }
workspace_create(name)                  -> { workspace_id }
workspace_open(workspace_id)            -> () | SchemaTooNew { required_version }
```

`organization_consent_result` returning the organizations the consent can reach is what
requirement 22 needs: the application selects an organization where one exists and falls back to
the personal account with the consequence stated, without asking the human to choose a slug.

`member_reset` returning `unreachable_workspaces` is requirement 13's stated limit made visible at
the call rather than discovered by the member.

# Data model

`organization.db`, on the customer's account. Every `_sealed` column is ciphertext under the
organization content key; every `signature` covers the authority fields of its own row and names
the certificate that signed it.

```
organization(id, name_sealed, verifying_key, remote_url, created_at)
member(id, email_sealed, email_local_hint, display_name_sealed,
       public_key, sealed_secret_key, sealed_content_key,
       kdf_salt, kdf_params, role, permissions,
       must_change_password, certificate_id, signature, created_at, updated_at)
administrator_certificate(id, member_id, signing_public_key,
       signature_by_organization_key, issued_at, revoked_at)
workspace(id, name_sealed, database_name, database_hostname,
       schema_version, certificate_id, signature, created_at, updated_at)
grant(member_id, workspace_id, sealed_credential, access_level,
       credential_expires_at, certificate_id, signature)
invitation(id, sealed_payload, expires_at, consumed_at,
       certificate_id, signature, created_at)
migration_lease(workspace_id, holder_member_id, expires_at)
```

**The signed fields are `role`, `permissions`, `public_key` and `certificate_id` on `member`, the
database identity on `workspace`, and the whole of `grant`.** `sealed_secret_key`, `kdf_salt` and
`kdf_params` are deliberately *not* signed: they are the member's own and rewriting them harms
nobody but the rewriter, which is what makes a password change a write a member may perform on a
database they hold full access to.

## The key schedule

```
member_key      = Argon2id(password, kdf_salt, kdf_params)
sealed_secret_key = XChaCha20-Poly1305(member_key, nonce, x25519_secret)
sealed_content_key = sealed_box(member.public_key, organization_content_key)
grant.sealed_credential = sealed_box(member.public_key, workspace_token)
invitation.sealed_payload = XChaCha20-Poly1305(
      HKDF-SHA256(invitation_secret, Argon2id(generated_password, salt)), ... )
```

`kdf_params` starts at Argon2id `m = 256 MiB, t = 3, p = 1` and **lives in the row rather than in
the code**, so raising the cost later is a re-seal on next sign-in and never a migration. There is
no rate limiting and cannot be, so this parameter is the entire defence and is a security decision
([[efforts/819-an-organization-hosts-its-own-workspaces/spec]], *Constraints*).

**The invitation needs both halves.** The link carries `invitation_secret`; the person carries the
generated password. Neither alone opens the payload, which is what makes requirement 8's "nothing
useful on its own" true of a link that also carries a read-only organization credential.

**No blinded email lookup is needed, and the earlier design's HMAC is dropped.** Requirement 17
keeps a local list of the organizations this machine has joined, so sign-in already knows the
member id before a password is typed. `email_local_hint` is a locally-stored convenience for
telling two members apart on a shared machine, not a lookup key in the database.

# Technical approach

The order is fixed by what can still fail, and by risk 5: deleting the only working account system
half-way leaves the application unusable.

1. **Prove the consent.** Extract the provider-agnostic OAuth core out of `sync/google/auth.rs`
   with no behaviour change, then drive one real Turso consent. **This is first because it can
   fail**, and everything from step 2 onwards assumes it did not. If the authorize endpoint
   refuses a loopback redirect, requirement 3 falls back to a pasted token and steps 2 onwards are
   unchanged.
2. **Port the Platform API client into Rust**, keeping `turso.ts`'s port shape so its tests still
   answer in memory, and provision a group and a database against a live account once.
3. **Build the vault and the authority chain, test-first, with no database and no network.** They
   are pure functions over bytes. This is where the cryptographic review happens, while there is
   nothing else in the diff to hide it.
4. **Stand up the organization replica** and its schema, and prove a second machine reads what the
   first wrote.
5. **Join, sign in, change password.** `admission.ts` is rewritten here, and this is the first
   step where a human can use any of it.
6. **The administration dashboard**: invite, grant, reset, remove, and both removal paths.
7. **The migration lease and the wire runner**, promoted from `database/test/workspace.rs`.
8. **Retire `apps/control-plane/` and Google sign-in**, and move what survives into
   `packages/turso-platform`. **Last, deliberately**: until step 7 lands, the control plane is the
   only thing that signs anybody in.
9. **Both locales**, alongside each surface rather than after all of them.

Steps 3 and 4 are independent of 1 and 2 and can proceed while the consent question is open.

# Integration

- **`tauri-plugin-opener`** opens the consent page, as it already does for Google sign-in.
- **The OS keyring** gains one service, `rentable.turso-platform`, beside the two that exist. It is
  where requirement 5 keeps the platform token, and it is the reason the token is never a column.
- **`packages/workspace-migrations`** is consumed by the desktop now as well as by the control
  plane, which it was already built for.
- **New Rust dependencies**, each justified because #817 removed four that nothing imported:
  `argon2`, `chacha20poly1305`, `x25519-dalek`, `ed25519-dalek`, `hkdf`. `sha2`, `base64`, `rand`
  and `keyring` are already in the manifest.

# Migration

- **`control-plane` and `control-plane-live-test` are not deleted by this effort.**
  [[references/turso]] forbids it under *Never run*, and the author's own hosted workspace is a
  person's data rather than a customer's.
- **The author's existing workspace is out of scope** by the spec's own exclusion. Whether it is
  carried across or recreated is decided on the day this lands.
- **`.env` shrinks.** `RENTABLE_CONTROL_PLANE_URL`, `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET` leave `apps/desktop/.env.example`. `TAURI_UPDATER_PUBLIC_KEY` stays.
- **No user data migrates**, because no customer exists yet. This is the one moment in this
  application's life when that is true, and it is why the effort is worth doing now rather than
  after the first customer.

# Testing strategy

| Criterion | Checked by |
| --- | --- |
| 1 | schema test: two workspaces of one organization, no unique constraint on an account |
| 2 | boundary test over the organization schema, the shape `control-plane/src/tests/boundary.test.ts` already has |
| 3 | a walk-through test of the setup path asserting the typed fields are name and password only |
| 4 | the requested scope set is pinned in a unit test against the authorization URL builder |
| 5 | a test that greps the organization schema and every writer for the platform token's keyring handle |
| 6 | live: provision on machine A, restore on machine B from link, email, password and one consent, A offline |
| 7 | invite returns a link and a password; the password is asserted independent of email and name |
| 8 | join on a machine with no prior state adds the organization to the local list |
| 9 | **the sign-in check is replaced with one that always returns true, and the workspace still cannot be opened.** This is the criterion that proves the password is not a comparison |
| 10 | a member with `must_change_password` is refused every other command |
| 11 | live: a `read-only` grant's write is refused by Turso; an administrator's delete is refused for want of authority |
| 12 | a table test over every act in `ADMINISTRATION` against every role |
| 13 | a password change leaves other members' rows byte-identical; a reset restores access; **a test asserts no administrator-held key opens a vault that administrator did not build**, which is what stops an escrow copy arriving later |
| 14 | live, both paths: ordinary removal leaves others syncing; lock-out refuses the removed credential and others recover after one reach. A test pins that the removed member's local replica still reads |
| 15 | given only the link's contents and a read-only credential, no email, display name or workspace name is readable from a populated database |
| 16 | a member writes another member's row with an altered role, and every other client rejects it on read |
| 17 | two organizations joined on one machine, both listed, switching without reinstall |
| 18 | sign-in with the network down on a machine that has signed in before |
| 19 | a test fails if any Google OAuth client id, secret or scope returns to the tree |
| 20 | `pnpm build` and `integration` pass with `apps/control-plane/` gone |
| 21 | both locales rendered for each new surface, right to left and left to right |
| 22 | both answers covered: an account reaching an organization, and one reaching none |
| 23 | a lapsed invitation is refused and its link still names the organization; a revoked one stops working |
| 24 | a migrated workspace opened by the previous schema version reads nothing and says why |
| 25 | a quota refusal produces an account message; reads and writes continue locally; a non-owner sees no account detail |

**Six of these reach a live Turso account.** [[rules/testing]], under *Tests that reach a live
remote*, counts three today and requires a new one to be admitted deliberately, by name, with its
property. Criteria 6, 11, 14 and the provisioning step of 2 are candidates and **each needs that
section edited before it is written**, not after.

# Operational considerations

- **Every customer now operates a Turso account**, and every failure it can have arrives as a
  failure of this application. Requirement 25 is the surface; the support burden behind it is the
  spec's last risk and has no technical answer.
- **A member who can write the organization database can destroy rows they cannot forge.** Recovery
  is Turso's point-in-time restore, run by whoever administers the customer's account. It is not
  in the application and this plan does not put it there.
- **A leaked migration lease blocks upgrades until it expires.** The expiry is what bounds it; a
  human can read the row.
- **The first run needs a network and a browser.** Everything after it does not.

# Technical risks

- **The key schedule is wrong in a way that reviews well.** It is the spec's second risk and the
  reason step 3 is built alone, test-first, before there is any other code in the diff to look at
  instead. It shows up as nothing at all.
- **The consent is refused at the authorize step.** Attacked on 2026-08-30 and found unanswerable
  from outside: the endpoint authenticates before it validates, so every probe returns the same
  redirect. Step 1 is where it is settled and the fallback is a pasted token.
- **`turso` 0.8.0-pre.7 holding two synced databases at once is unproven.** The organization
  replica and the workspace replica are two engines over two files, which `database/mod.rs` says is
  permitted, but nothing here has ever opened two. It would first show up as a hang on turso's IO
  thread, the same shape `install_crypto_provider` guards.
- **Argon2id at 256 MiB on a low-end machine.** Sign-in is the only place it runs, and if it is too
  slow the parameters move down, which weakens the only defence there is. Measuring it on real
  hardware is step 3's, not a later discovery.
