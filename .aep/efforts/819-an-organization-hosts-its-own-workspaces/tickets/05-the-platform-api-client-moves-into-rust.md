---
status: resolved
blocked-by: ['01', '21']
---

# feat(sync): the Platform API client moves into Rust

## Outcome

`sync/turso/platform.rs` does what `apps/control-plane/src/workspace/turso.ts` does today: create a
database, mint a credential for it with an expiry, and delete one. It keeps `turso.ts`'s port
shape, so its tests answer in memory the way the control plane's do. It is **given** the
organization slug and the group rather than discovering either, and it creates one database against
a live account once to prove the port is honest.

## Acceptance Criteria

Traces requirement 4 and requirement 20 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 11.

- [x] The operations `createDatabase`, `mintToken` and `deleteDatabase` exist in Rust with the same
      arguments and the same failure vocabulary they have in TypeScript, and a fake implementation
      of the port answers them in memory so every caller above is testable without a network.
      *Verified: `sync/turso/platform.rs` is the `TursoPlatform` trait with `create_database(name)`,
      `mint_token(database_name, expiration)` and `delete_database(name, intent)`, `PlatformApi` as the
      real implementation and `InMemoryPlatform` under `#[cfg(test)]` as the fake every caller above is
      tested against. The failure vocabulary is `PlatformError::{Unreachable, Refused}`, `turso.ts`'s two,
      with the same sentences (*try again in a moment*, *trying again will not help*) and Turso's own text
      never in them; `AccountRefused` and `NoAuthority` are the two additions the criteria below ask for.
      Fourteen scripted-server tests pin the paths, the method, the bearer header, the body, both hostname
      spellings, the query, and each failure mapping; `the_in_memory_platform_keeps_the_facts_turso_keeps`
      pins the fake's unique names, protected creates, recorded mints and recorded deletions.*
- [x] **Nothing here lists organizations.** A group-scoped token answers 403 at that endpoint
      ([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]), and requirement 22 no longer
      needs it. A test asserts no call is ever made to `/v1/organizations`.
      *Verified: `assert_never_lists_organizations` walks every request the scripted server recorded across
      the create, the mint and the delete and fails on a target of `/v1/organizations`; nothing in the
      module builds that path, and every URL is under `/v1/organizations/{slug}/databases`.*
- [x] **Delete protection is turned on for every database this creates**, in the same operation that
      creates it rather than in a later pass, so a database is never briefly unprotected. Requirement
      4 asks for it because the granted scope set carries deletion whatever was requested. The
      module's own documentation states that a caller holding `db:configure` can turn it off again,
      so nobody reads it as a guarantee.
      *Verified: Turso's create takes no protection field (checked against
      `docs.turso.tech/api-reference/databases/create` on 2026-09-11), so the protection is a second
      request, `PATCH .../databases/{name}/configuration {"delete_protection": true}`, made inside
      `create_database` before it returns. The window is one request wide and unavoidable; what the
      operation guarantees is that nothing unprotected is handed back: a create whose protection request
      fails removes the database it made and reports the create failed, which
      `a_database_that_cannot_be_protected_is_removed_and_the_create_fails` pins, and
      `creating_a_database_names_it_groups_it_protects_it_and_reads_the_hostname_back` asserts the create is
      exactly two requests. The module comment states that the same grant carries `db:configure`, so the
      protection is a barrier and not a guarantee, and `delete_database` is the one path that lifts it.*
- [x] **No group is created.** Nothing available to the application can create one, and requirement
      3 puts that step in the customer's hands before the consent. The group is a value this port is
      handed.
      *Verified: `PlatformApi::new(endpoint, organization)` takes a `TursoOrganization` carrying the slug and
      the group, and the group appears only in the create's body. No request in the module targets
      `/groups`.*
- [x] **Deletion is behind an explicit caller-supplied intent**, not merely a method that exists.
      Requirement 4 permits deleting only while the human is deleting a workspace in the interface
      at that moment, and a port that offers deletion as freely as creation makes that requirement
      unenforceable from the outside.
      *Verified: `delete_database` takes `DeletionIntent`, an enum with the two reasons [[references/turso]]
      permits under *Never run*, `WorkspaceDeletedByHuman` and `CreatedAndUnreferenced`, so there is no
      way to call it without naming one, and the intent is written to the diagnostics log with the
      database name. The fake records `(name, intent)` per deletion so a caller's reason is assertable.*
- [x] A quota or billing refusal is a distinguishable error rather than a generic HTTP failure.
      Requirement 25 needs to tell an account problem from a network problem, and the place that
      distinction is made is here, at the response, not three layers up by guessing at a message.
      *Verified: `PlatformError::AccountRefused` is decided in `call`, at the response: `402`, or a 4xx whose
      `error` body carries the words Turso publishes for the condition (*quota*, *blocked*, *billing*,
      *exceeded*). Turso documents no status for it on any endpoint, which the function's comment says,
      along with what will correct it: the first real one anybody sees.
      `a_refusal_that_belongs_to_the_account_is_told_apart_from_one_about_the_request` drives a 402 and a
      quota body to `AccountRefused` and a `group not found` to `Refused`, and asserts the account message
      names the account and not sync. Its crossing to the web layer is `PreconditionFailed` with that
      message for now; the code requirement 25's surface needs is ticket 17's.*
- [x] Live, once, and asked for first: a database is created in the group the consent named, a
      credential is minted for it, delete protection is asserted on, and the database is deleted
      again by the same run after the protection is lifted. Admitted by name in ticket 01.
      *Verified: 2026-09-11, asked for first and the database named beforehand.
      `platform_live_creates_protects_mints_and_removes_one_database` ran with the 2026-08-30 consent's
      token handed through the test process's environment, `TURSO_ORG=saud-alnasser`,
      `TURSO_GROUP=rentable`. It created `t819-05-18d450c2cbb1d764` at
      `t819-05-18d450c2cbb1d764-saud-alnasser.aws-eu-west-1.turso.io`, read `delete_protection: true`
      back from `GET .../configuration` rather than from the port's own belief, minted a three-part JWT
      for `1h`, lifted the protection and deleted the database, all in one run that printed `ok`. The
      account holds nothing this run made. The `PATCH .../databases/{name}/configuration` path the
      reference doubted is the one that worked, and the reference is corrected in the same commit.*
- [x] `cargo test`, `cargo clippy` and the repository's gates pass.
      *Verified: `cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml -- --test-threads=1` gives
      `264 passed; 0 failed; 6 ignored`, sixteen of them this module's and the sixth ignored its live
      test. `cargo clippy --all-targets` gives the same five warnings that stand at the branch point,
      none in `platform.rs`. `cargo fmt --check` is clean.*

## Relevant areas

`apps/control-plane/src/workspace/turso.ts` is the thing being ported. `TURSO_PLATFORM_API` is
`https://api.turso.tech`, and the `TursoPlatform` port is already the right shape: this is a
translation, and a Rust port that looks nothing like it means something was decided here that
should have been decided in the plan.

`apps/control-plane/src/workspace/tests/provisioning.test.ts` is the existing live provisioning
test and shows what a live run of this costs and how it cleans up after itself.

`apps/desktop/tauri/src/http/` holds the shared client and `install_crypto_provider`, which
`database/mod.rs` calls to guard a rustls double-provider panic that reaches the caller as a hang.
Whatever this uses for HTTP goes through the same place.

## Constraints

- **[[references/turso]], *Never run*.** Do not delete a database this run did not just create. Do
  not touch `control-plane` or `control-plane-live-test`. Do not rotate or revoke the Platform API
  token. **Ask before the live half**, every time, and name the database it will create.
- **[[rules/credentials]], *Client boundary*.** Minted credentials do not cross to TypeScript.
- **The TypeScript client is not deleted here.** `apps/control-plane/` is still the only thing that
  signs anybody in until ticket 19, and requirement 20's package is that ticket's.

## Notes

Blocked on ticket 21 because the live half needs both a Platform API token and the organization
slug every Platform API path is built from. Ticket 04 obtained the first and found that the second
is not in the token, so ticket 21 is what supplies it. *This paragraph named ticket 04 until the
re-plan on 2026-08-30 moved the edge, and the frontmatter moved before the prose did.*

The port shape is worth defending under review. It is what lets tickets 09, 14 and 15 be tested
without a network, and the alternative, a client that talks to `reqwest` directly from every call
site, is the thing the control plane deliberately did not do.
