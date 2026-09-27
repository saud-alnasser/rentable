---
status: resolved
---

# feat(organization): writing a record needs viewing it, and a new role clears the override

## Outcome

The human's calls of 2026-09-27. Today a role can let someone edit contracts they cannot see, and
a member given another role keeps an override that now switches different flags. After this, no
role mask and no member's effective permissions carrying a kind's add, edit or delete without its
view flag is written, by the package's check and by Rust's, and assigning a role clears the
member's override, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Permissions as switches*, gives it.

## Acceptance Criteria

Traces requirement 6 and requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `packages/workspace-permission` exports the check (each kind's write flags need its view
      flag) and a test covers every kind; the TS routers refuse a role or override that breaks it.
- [x] Rust's `role::apply`, `set_override` and role creation refuse the same, naming the kind, in
      English and Arabic. A test covers a role mask and an override.
- [x] `assign_role` clears the member's override in the same signed write; a test finds a member
      with an override given another role holding it exactly.
- [x] The built-in masks pass the check.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `packages/workspace-permission/index.ts`, `tauri/src/organization/role.rs`, `permission.rs`,
  `error.rs`, `src/lib/organization/router.ts`, `src/lib/i18n`
