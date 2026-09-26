---
status: resolved
blocked-by: [14]
---

# refactor(organization): the old role word retires

## Outcome

Converge, round 1. Requirement 3 replaces the administrator with the manager, and the plan makes a
member's `role` the built-in kind. Tickets 04 to 08 kept bridges for the flows still speaking the
old word: `permission::word_of_role` and `MemberRecord::role_word()` give `MemberSession.role` and
the machine's `HeldOrganization.role` the words owner, administrator, member and removed, and
`permission::role_id_of_word`, `override_for_acts` and `acts_of` translate the seven acts of effort
826. After this, the session and the machine record carry the role's kind, a removal is read from
`removed_at`, and the bridges are gone.

## Acceptance Criteria

Traces requirement 3 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 3.

- [x] `MemberSession.role` and `HeldOrganization.role` hold the role's kind (owner, manager, member
      or custom), and a removed member is known by `removed_at`; a machine record written by an
      earlier build of this effort is read or forgotten by the existing startup pattern.
- [x] `word_of_role`, `MemberRecord::role_word`, `role_id_of_word`, `override_for_acts` and `acts_of`
      have no caller and are deleted; the tests that compared the seven acts compare effective
      permissions instead.
- [x] A grep of the Rust and TypeScript sources finds the word administrator in no role value, no
      role constant and no user-facing string; what is left is named in the commit (the signing
      key's type and derivation purpose, whose value is fixed by every vault).

## Relevant areas

- `tauri/src/organization/permission.rs`, `store.rs`, `session.rs`, `role.rs`, `invite.rs`,
  `setup.rs`, `connect.rs`, `join.rs`, `machine.rs`, `mod.rs` (`HeldOrganization`)
- `src/lib/platform/host.ts` where the machine record's role is typed

## Constraints

- The derivation purpose string that makes a member's signing key is not changed: changing it
  changes every key a vault derives.
