---
status: resolved
---

# refactor(sync): the credential store is one module

## Outcome

`tauri/src/keyring.rs` holds the one way this application reaches the OS credential store,
with the test static and its turn lock, and the Turso consent files and reads its token
through it. No behaviour changes; the second entry the remembered session needs has somewhere
to go.

## Acceptance Criteria

Traces requirement 12 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 12 (the keyring fake the Rust tests run over).

- [x] `tauri/src/keyring.rs` exports `store(service, account, value)`, `read(service,
      account)` answering `Option<String>`, and `forget(service, account)`, over the `keyring`
      crate under `#[cfg(not(test))]`, and over a process-wide static keyed by `(service,
      account)` under `#[cfg(test)]`, with `take_the_credential_store()` and
      `CredentialStoreTurn` moved here.
- [x] `sync/turso/consent.rs`'s `store_platform_token`, `platform_token` and
      `forget_platform_token` call it with the existing service and account names; the
      `keyring` crate is imported in `keyring.rs` and nowhere else (`grep`).
- [x] Every test that took the credential store's turn (`forget.rs`, the consent's own) takes
      it from the new module and passes.
- [x] A missing entry reads as `None`, and a store refusal is an `Error::Credential` that
      never quotes the value; asserted over the fake.
- [x] `cargo test` passes.

## Relevant areas

`apps/desktop/tauri/src/{lib.rs,keyring.rs}`, `sync/turso/consent.rs`, `organization/forget.rs`.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *A remembered
  session is the derived member key in the keyring*, its last paragraph.**
- **[[rules/module-layout]]**: one word, at the crate root, since neither `sync` nor
  `organization` owns the store.
- **[[rules/credentials]]**: the module hands values to callers in this crate only; nothing
  here is a command.

## Notes

Cut as a ticket of its own so the lift is reviewable apart from the session it enables; a
child building it needs no knowledge of the organization.
