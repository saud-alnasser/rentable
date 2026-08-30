---
status: open
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

- [ ] A password change re-seals the member's own credentials and leaves every other member's row
      **byte-identical**, asserted rather than argued.
- [ ] An administrator's reset restores a member's access without the administrator learning the
      member's previous password, and without the member's previous password being needed.
- [ ] **A test asserts that no key an administrator holds opens a vault that administrator did not
      build.** This is what stops an escrow copy arriving later as a convenience, which the spec
      forbids under *Constraints* and which requirement 13 settles by making reset a reissue.
- [ ] `member_reset` returns `unreachable_workspaces`: the workspaces the resetting administrator
      cannot reach themselves and therefore cannot restore. Requirement 13 states this limit and
      the plan puts it at the call rather than leaving the member to discover it.
- [ ] A member may choose their own password at first change, subject to a strength floor checked
      on the machine, and a password below the floor is refused. The interface says why the floor
      exists rather than showing a meter: there is no server to slow an attacker down and the
      password is the whole defence.
- [ ] Clearing `must_change_password` is what ends ticket 12's requirement to change, and a member
      who has not cleared it still reaches nothing else.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

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
