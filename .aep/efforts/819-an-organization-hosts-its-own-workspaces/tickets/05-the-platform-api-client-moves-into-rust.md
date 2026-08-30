---
status: open
blocked-by: ['01', '04']
---

# feat(sync): the Platform API client moves into Rust

## Outcome

`sync/turso/platform.rs` does what `apps/control-plane/src/workspace/turso.ts` does today: create a
database, mint a credential for it with an expiry, delete one, and list the organizations a token
reaches. It keeps `turso.ts`'s port shape, so its tests answer in memory the way the control
plane's do, and it provisions a group and a database against a live account once to prove the port
is honest.

## Acceptance Criteria

Traces requirement 4 and requirement 20 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 11.

- [ ] The operations `createDatabase`, `mintToken` and `deleteDatabase` exist in Rust with the same
      arguments and the same failure vocabulary they have in TypeScript, and a fake implementation
      of the port answers them in memory so every caller above is testable without a network.
- [ ] Listing the organizations a token reaches is part of the port, because requirement 22 needs
      it and ticket 03 returns it from the consent. One implementation, not two.
- [ ] **Deletion is behind an explicit caller-supplied intent**, not merely a method that exists.
      Requirement 4 permits deleting only while the human is deleting a workspace in the interface
      at that moment, and a port that offers deletion as freely as creation makes that requirement
      unenforceable from the outside.
- [ ] A quota or billing refusal is a distinguishable error rather than a generic HTTP failure.
      Requirement 25 needs to tell an account problem from a network problem, and the place that
      distinction is made is here, at the response, not three layers up by guessing at a message.
- [ ] Live, once, and asked for first: a group and a database are created against a real account,
      a credential is minted for it, and the database is deleted again by the same run. Admitted by
      name in ticket 01.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

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

Blocked on ticket 04 because the live half needs a Platform API token, and 04 is where one is
obtained by the route this effort intends. If 04 finds the consent refused, the token arrives by
paste instead and this ticket is unchanged.

The port shape is worth defending under review. It is what lets tickets 09, 14 and 15 be tested
without a network, and the alternative, a client that talks to `reqwest` directly from every call
site, is the thing the control plane deliberately did not do.
