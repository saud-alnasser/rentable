---
status: open
blocked-by: [04]
---

# refactor(organization): invitation, reset and removal run on the delegated chain

## Outcome

Inviting, making a link, resetting a password, ending sessions, removing and locking out read the
actor's effective permissions and rank from their verified row, and issue or revoke delegated
certificates through 04's routine. `member_create` takes a role id and an override. Reset and
removal are no longer the owner's alone; lock-out still is.

## Acceptance Criteria

Traces requirements 5, 7 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 5, 7 and 9.

- [ ] `member_create` takes `role_id` and `override`, refuses a role not strictly below the actor,
      and refuses an override or role carrying a flag the actor lacks (criterion 7).
- [ ] The new member's certificate is issued from the actor's, with the ceiling and rank of their
      effective permissions; no organization key is derived.
- [ ] A manager resets a member's password with no organization key derivable in the test; the
      member's fresh certificate verifies and the rows their old one signed still verify.
- [ ] A manager removes a member; rows signed under the removed member's certificate afterwards are
      refused; rows signed before verify (criterion 9).
- [ ] A removal whose departing certificate signed a row the actor cannot sign is refused, naming
      the flag.
- [ ] Lock-out stays the root's; the `session.role` snapshot checks in these files read the verified
      row.

## Relevant areas

- `organization/invite.rs`, `removal.rs`, `session.rs`, `password.rs`, and their tests

## Constraints

- "administrator" becomes "manager" in every identifier this ticket touches.
