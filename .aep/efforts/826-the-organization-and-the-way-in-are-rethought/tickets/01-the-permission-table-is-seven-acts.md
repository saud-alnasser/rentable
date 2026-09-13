---
status: resolved
---

# refactor(organization): the permission table is seven acts

## Outcome

`packages/workspace-permission` and `organization/permission.rs` carry the seven grantable acts
of requirement 4 on bits 0 to 6, the owner and the administrator carry every one of them and a
member none, every `require` call site names the act that now covers it, the acts that need the
Turso authority stay behind `require_owner`, the invitation table carries the two columns the
one-link invitation needs, and a replica written under the six-act table is forgotten at
startup. Nothing a person sees changes yet.

## Acceptance Criteria

Traces requirement 4, requirement 5, requirement 6 (the role masks) and requirement 19 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 4,
criterion 5 (the Rust half) and criterion 19 (the Rust half).

- [x] `packages/workspace-permission/index.ts` exports `ADMINISTRATION` as `inviteMember 0`,
      `removeMember 1`, `changeRole 2`, `renameWorkspace 3`, `resetPassword 4`, `renameMember 5`,
      `grantWorkspace 6` and nothing else; `ADMINISTRATION_BY_ROLE` reads `owner:
      maskOf(...EVERY_ADMINISTRATION)`, `administrator: maskOf(...EVERY_ADMINISTRATION)`,
      `member: 0`; `tests/permission.test.ts` is rewritten for the seven and passes; `grep -r
      transferOwnership` over `packages/` and `apps/desktop/src` finds nothing.
- [x] `organization/permission.rs` mirrors it: the enum, `ALL`, `name`, `mask_of_role`, the
      three literal lines the text-reading test pins, `mask_of_role(OWNER) == 0b111_1111`;
      `setup::OWNER_PERMISSIONS` is `0b111_1111`; the package-reading tests pass.
- [x] `workspace::grant_workspace` requires `GrantWorkspace`; `invite::rename_member` requires
      `RenameMember`; `invite::reissue_invitation` requires `ResetPassword`;
      `invite::revoke_invitation` and `invite_member` keep `InviteMember`; `removal` keeps
      `RemoveMember`; `rename_workspace` keeps `RenameWorkspace`. Every `require_owner` call is
      unchanged, and one test each in `workspace.rs` and `removal.rs` calls create, delete,
      renew and lock-out with an administrator holding all seven bits and is refused with the
      sentence naming the owner.
- [x] The `invitation` table carries `sealed_secret BLOB NOT NULL` and `issued_by TEXT NOT
      NULL`, `InvitationRecord` carries both, neither is under the invitation signature, `issue`
      writes the generated password sealed to the issuer's public key and the issuer's id, and
      the seven-tables test in `store.rs` pins the columns.
- [x] `forget::OldShape` gains a variant for an `invitation` table without `sealed_secret`;
      `old_shape` reads it after the username check; the startup test in `forget.rs` builds a
      replica of the six-act shape and asserts it is forgotten.
- [x] `organization/router.ts` gates `workspace.grant` on `grantWorkspace`, `member.rename` on
      `renameMember`, `invitation.reissue` on `resetPassword`, and `workspace.remove` on
      `procedure.member`; `organization/tests/administration.test.ts` and
      `sync/tests/router.test.ts` name the seven acts.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`packages/workspace-permission/{index.ts,tests/permission.test.ts}`;
`apps/desktop/tauri/src/organization/{permission,setup,invite,workspace,removal,store,forget}.rs`;
`apps/desktop/src/lib/organization/router.ts`, `sync/router.ts`, and their tests.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Certification
  stays the owner's* and *Data Model*.**
- **Bits 4 and 5 change meaning, and that is safe only because the forget signal lands in
  this same ticket.** Never ship the table without the signal.
- **The preimages in `authority.rs` do not change**; the two new columns sit outside the
  invitation signature. If a change here makes a fixed vector in `authority.rs:1008` fail, stop:
  something was signed that the plan says is not.
- **[[rules/testing]]**: each Rust module keeps its own fixture; extend `store.rs::populated`
  and the builders in place.

## Notes

The sealed secret and the issuer land here rather than in the link ticket so that the forget
signal has a column to read; until ticket 03 the link still carries no invitation half and the
secret is written and read by nobody.
