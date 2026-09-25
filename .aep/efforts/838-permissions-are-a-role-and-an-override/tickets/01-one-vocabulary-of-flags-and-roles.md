---
status: open
---

# feat(organization): one vocabulary of flags, roles and the effective computation

## Outcome

`packages/workspace-permission` and `organization/permission.rs` name every flag the plan lists, on
the bits it gives them, with the families, the owner's flags, the built-in roles' ids, ranks and
default masks, and one `effective` routine per language that a shared table of cases holds equal.
Nothing else reads the new names yet: the old ones stay as aliases on the same bits.

## Acceptance Criteria

Traces requirements 1, 2, 3 and 6 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 1 and 6.

- [ ] `FLAGS` holds bits 0 to 39 exactly as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Components*, lists them; `changeRole` is an alias
      of `assignRole` on bit 2, and `ADMINISTRATION`, `EVERY_ADMINISTRATION` and
      `ADMINISTRATION_BY_ROLE` still export for today's importers (criterion 1).
- [ ] The 53-bit guard test still fails a flag at bit 53, and a test holds every flag below it.
- [ ] `FAMILIES`, `OWNER_ONLY`, `MEMBER_ADMINISTRATION`, `WRITE_FLAGS` and `BUILT_IN` export, with the
      masks and ranks the plan gives.
- [ ] `effective`, `effectiveIn`, `xorOf`, `maskOf` and `permits` are arithmetic; a test at bit 39
      shows `xorOf` and `permits` right where `^` and `&` would coerce to 32 bits.
- [ ] A JSON table of `(mask, override, effective)` cases, checked in once, is read by a TS test and
      a Rust test, and both pass (criterion 6).
- [ ] The Rust test that reads the package source asserts the names, bits, families and built-in
      defaults, and fails when either side drifts (criterion 1).

## Relevant areas

- `packages/workspace-permission/index.ts` and `tests/permission.test.ts`
- `apps/desktop/tauri/src/organization/permission.rs` (its package-reading tests)

## Constraints

- No caller changes in this ticket; the aliases are what keep it one commit.
- The case table lives in the package's `tests/`, and the Rust test reads it by path, as the existing
  test reads `index.ts`.
