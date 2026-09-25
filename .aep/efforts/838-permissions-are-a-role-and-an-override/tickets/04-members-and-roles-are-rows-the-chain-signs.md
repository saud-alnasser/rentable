---
status: open
blocked-by: [03]
---

# feat(organization): members and roles are rows the chain signs

## Outcome

A member row is `member.v3`, carrying its id, `role_id` and `override` under signature, and a removal
as signed `removed_at`; roles are `role.v1` rows; a new organization is created with its format, the
owner's root certificate, and the manager and member role rows. The shared routine that issues a
fresh certificate, revokes the old one and re-signs its rows (mark and roles included) exists and is
tested, ready for 05 to 07.

## Acceptance Criteria

Traces requirements 3, 5 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 3, 5 and 9.

- [ ] `member` and `role` tables, and their preimages, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Data Model* and *Components*, give
      them; the `role` and `permissions` columns are gone; the owner role is the constant, not a row.
- [ ] `create_organization` yields exactly the owner (root certificate, ceiling every flag), and the
      manager and member rows with `BUILT_IN`'s masks and ranks (criterion 3).
- [ ] Every member row names exactly one role, and a member row naming the owner role verifies only
      for the owner (criterion 5).
- [ ] A member row whose signer does not outrank the role it names is refused on read.
- [ ] `store::re_sign_rows_of_certificate` covers `mark` and `role`; a test retires the certificate
      that set the mark and still reads the mark.
- [ ] The issue-revoke-re-sign routine writes the new certificate, the revocation and the re-signed
      rows in one transaction, and refuses, naming the flag, where the actor cannot sign a row the
      old certificate signed.

## Relevant areas

- `organization/store.rs`, `authority.rs`, `setup.rs` (`create_organization`)
- `organization/role.rs`, beside today's certificate code

## Constraints

- Where the routine lives is the implementer's call; its three steps in one transaction are not.
