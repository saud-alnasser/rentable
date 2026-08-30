---
status: open
blocked-by: ['11']
---

# feat(organization): a member joins by opening a link

## Outcome

Opening an invite link on a machine that has never seen the organization registers it there and
adds it to the login screen's list. The link carries what the machine needs to find the
organization and nothing that is useful on its own. Joining consumes the invitation, builds the
member's vault under the generated password, and leaves them required to change it.

## Acceptance Criteria

Traces requirement 8, requirement 15, requirement 21 and requirement 23 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 8, criterion 15
and criterion 21.

- [ ] Opening the link on a machine with no prior state adds the organization to the login screen's
      list, with its name and remote, and the organization's verifying key is pinned locally from
      the link rather than read from the database it protects.
- [ ] **Holding the link alone yields nothing about who is in the organization.** Given the link's
      contents and the read-only credential it carries, no email address, display name, or
      workspace name is readable from a populated database. A test asserts it against real rows.
- [ ] Joining requires the generated password as well as the link, and neither alone opens the
      invitation payload.
- [ ] A consumed invitation cannot be consumed a second time, and a test drives the second attempt.
      A lapsed or revoked one is refused with the organization still named, which is ticket 11's
      criterion seen from this side.
- [ ] The joined member's vault is written, their grants are sealed to their new public key, and
      `must_change_password` is set, which ticket 13 is what clears.
- [ ] The link opens the application. How a link reaches the application on each platform is a
      decision this ticket makes and records; a link that only works when pasted into a field is a
      worse answer than one that does not, and either is better than an undocumented one.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Relevant areas

`apps/desktop/src/lib/organization/` holds the join screen beside the setup walk from ticket 09 and
the sign-in from ticket 10, all three of which are the same few screens seen from different
starting states.

`apps/desktop/tauri/src/organization/store.rs` holds `invitation` with its `sealed_payload`,
`expires_at` and `consumed_at`. The local list of joined organizations is machine-local and is the
same record ticket 10 reads at sign-in.

`tauri-plugin-opener` is already a dependency, used to open the browser for Google sign-in. It
opens links; receiving one is the other direction and is what needs deciding here.

## Constraints

- **[[rules/credentials]], *Client boundary*.** The link's contents are parsed in Rust. The web
  layer receives the organization's name and whether the invitation is still good.
- **A read-only credential in the link is deliberate and bounded.** The spec's third assumption is
  that read-only is enough for a member to reach the organization database before their vault is
  open. If it turns out a joining member must write first, requirement 15's protection is harder
  and that is a finding worth raising rather than working around quietly.
- **The invitation's signature is verified before it is consumed.** An unsigned or badly signed
  invitation is refused.

## Notes

Requirement 6 is nearly this ticket seen from the owner's side, and ticket 18 is what proves it. A
join implementation that only works for a member and not for an owner returning on a new machine
will be found there rather than here.
