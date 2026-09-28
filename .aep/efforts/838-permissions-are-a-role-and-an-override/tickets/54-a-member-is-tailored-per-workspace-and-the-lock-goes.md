---
status: resolved
blocked-by: [53]
---

# feat(desktop): a member is tailored per workspace, and the lock goes

## Outcome

Beneath each workspace a member is in, their card tailors what they may do there with the record
switches, measured against their organization-wide permissions, with a reset and a read only
preset. The owner's lock leaves the card, the add-member form and the workspace's dialog.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a
third time.

- [x] A workspace switched on shows a disclosure that opens its record switches (the shared list,
      record groups only), with the difference dots against the organization-wide permissions, a
      *custom* mark where any differs, a reset and a read only preset. A switch the reader does not
      hold is dimmed with its reason, and without `overrideMember` all are, naming it.
- [x] Saving writes each changed workspace's override through the act of ticket 53, beside the
      in/out grants. A grant minted read-only reads with its writes off and the preset on; turning
      a write on re-grants it full access, refused with its reason where the reader does not hold
      the workspace at full access.
- [x] No lock switch on the card, the add-member form or the workspace's dialog; the dialog marks a
      person tailored there; the interface makes no read-only grant.
- [x] Words in English and Arabic; component tests for each of the above, and the existing lock
      tests replaced.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.
