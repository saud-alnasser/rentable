---
status: open
---

# feat(permission): the upgrade data permission

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `organization/role/permission.rs`; Migration*).

## Outcome

A new administration permission, `upgradeData`, exists on bit 18: the owner always holds it, the manager role carries it by default, the member role does not, and a custom role or an override can carry or remove it; the owner's machine adds it once to an existing manager role.

## Acceptance Criteria

Traces requirement 3 and criterion 3.

- [ ] `upgradeData` is bit 18 in Rust and in `packages/workspace-permission`, in the administration family, in `MANAGER_ROLE`, not in `MEMBER_ROLE` or `OWNER_ONLY`; the test pinning the two sides passes.
- [ ] An override granting it and one removing it both apply, under the existing override rules.
- [ ] At the owner's first sign-in on this build, the stored manager role gains bit 18 as a signed write and keeps any other edit; nothing else is written; a test covers an edited and an unedited manager role.
- [ ] The flag has a name and description in Arabic and English wherever roles and overrides list flags.

## Relevant areas

- apps/desktop/tauri/src/organization/role/permission.rs, apply.rs
- packages/workspace-permission/index.ts
- apps/desktop/tauri/src/organization/session/signin.rs (`owner_row_repaired`)
- the role and override editors under apps/desktop/src/lib/organization/

## Constraints

- No command uses the flag yet; ticket 07 does.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
