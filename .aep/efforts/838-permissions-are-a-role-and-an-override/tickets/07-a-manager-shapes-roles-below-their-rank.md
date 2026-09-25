---
status: resolved
blocked-by: [05, 06]
---

# feat(organization): a manager shapes roles and assigns them below their rank

## Outcome

The role commands, `member_assign_role` and `member_set_override` exist, each gated on its flag, on
rank, on "never yourself" and on "only flags you hold", and each change re-issues the affected
members' certificates in the same act. A manager gives a member a signing flag with the owner's
machine off, and it verifies on the next sync.

## Acceptance Criteria

Traces requirements 3, 4, 5, 6, 7 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 1, 3, 4, 5, 6, 7 and 9.

- [x] `organization_roles`, `role_create`, `role_rename`, `role_set_mask`, `role_move`,
      `role_delete`, `member_assign_role` (replacing `member_change_role`) and `member_set_override`
      exist with the signatures and gates in [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Interfaces*.
- [x] Deleting or renaming a built-in role, or editing the owner's mask, is refused; the owner edits
      the manager's and the member's masks (criterion 3).
- [x] The role lifecycle: custom ranks stay strictly between member and manager after every move,
      a renumbering included; deleting a role moves its holders to member, reading the member mask
      XOR their override (criterion 4).
- [x] Assigning the owner role is refused (criterion 5); the owner's row refuses an override
      (criterion 6).
- [x] The rank matrix: for each management flag and each of above, equal, below and self, every act;
      only strictly below succeeds. A holder of every management flag lacking one record flag
      switches it in a role and in an override, on and off, and is refused both ways (criterion 7).
- [x] Three stores on one database, no organization key derivable: a manager assigns a role holding
      `inviteMember` to a member, and after a sync that member's invitation row verifies on the
      third store; editing a role's mask re-issues every holder's certificate (criterion 9).
- [x] A Rust test lists every organization command with its gate and fails on one with none
      (criterion 1, the Rust half).

## Relevant areas

- `organization/role.rs`, `command.rs`, `lib.rs` (command registration)

## Constraints

- "Flags held" compares before and after at the command, per [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Interfaces*; nothing here moves
  that check into the reader.
