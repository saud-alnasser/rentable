---
status: open
---

# fix(organization): two machines acting together never brick the directory

## Outcome

The human's decisions after review round two. Correctness finding B: a member row was bounded by its
whole effective permissions, which reads the role's mask as it stands now, so two machines acting
offline together made every member read refuse (the owner widening the member role on one while a
lead invited on the other). Finding C: a removed member's row was bounded the same way, so a
removal was refused wherever the member role carried a flag the remover lacked. The human chose
that the race be fixed without anybody having to act, and that a removed member's row grant
nothing. After this, per the table as corrected again in
[[efforts/838-permissions-are-a-role-and-an-override/plan]], *Architecture*, a member row is bounded
by the signer's ceiling in the flags its override switches, a row a certificate no longer covers
grants nothing on read instead of refusing the directory, and a removed member's row grants
nothing and is never refused for what the member role carries.

## Acceptance Criteria

Traces requirements 7 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 7 and 9.

- [ ] `authority::covers` bounds a member row by the ceiling in the flags its override switches, not
      its whole effective permissions; it still refuses a delegated certificate signing its own
      member's row, an override switching a flag the ceiling lacks, and a role row whose mask the
      ceiling does not hold. The review's own-row, override and role-row cases still fail on read.
- [ ] The review's race (a lead invites on one replica while the owner widens the member role on
      another, merged) reads the whole directory on every machine, with the new member holding the
      widened member role's permissions; a test, shown failing before the change.
- [ ] A member row whose signature and chain verify but which its certificate no longer covers (a
      concurrent rank move leaves one) is read with no permissions rather than refusing the read,
      and reads as covered again once a member who covers it saves the member; a test for each.
- [ ] A removed member's row grants nothing, and a removal is not refused for any flag the member
      role carries; the check ticket 18 added for it is gone, and a test removes a member below a
      manager who lacks a flag the member role carries.
- [ ] Every command that judged a member row by its effective permissions against a ceiling
      (`role::apply`, the store's write guard, the re-sign pre-check) judges it by the corrected
      table, and the organization context's *Chain* entry says so.

## Relevant areas

- `tauri/src/organization/authority.rs` (`covers`, `Chain`), `store.rs` (the member read, the write
  guard, `effective_of`), `role.rs` (`apply`), `removal.rs` (`retire_member`)
- `.aep/contexts/desktop/organization.md` (*Chain*)

## Constraints

- A row whose signature or chain does not verify still refuses the read: only a genuine row its
  certificate has stopped covering grants nothing instead.
