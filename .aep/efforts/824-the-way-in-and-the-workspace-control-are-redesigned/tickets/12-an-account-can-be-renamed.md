---
status: resolved
blocked-by: [09]
---

# feat(organization): an account can be renamed

## Outcome

The owner or an administrator renames a member from the members list; the row is re-sealed and
re-signed by the actor; a member cannot rename themselves.

## Acceptance Criteria

Traces requirement 23 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 23.

- [x] `member_rename(member_id, username)` validates through ticket 09's `validate_username`,
      refuses a taken username, re-seals and re-signs the row under the actor's signer, and is
      refused for a session whose `member_id` is the target and for one without the permission.
      Asserted in Rust: rename by the owner is read back by `members()`; the three refusals. *Verified 2026-09-13 on the effort branch: `cargo test a_rename` printed `2 passed; 0 failed`, the read-back case moving the row's certificate to the renamer's and the refusal case covering taken, rules, self, permission and unknown.*
- [x] A rename row on each member in `members.svelte` opens a light `FormSurface` with one
      username field carrying its glyph and a verb glyph on its button; the dialog reads the same
      refusal sentence the invite form does. Asserted in `members.svelte.test.ts`. *Verified: `npx vitest run src/lib/organization/tests/members.svelte.test.ts` on the effort branch printed 11 passed, after the avatar's test (ticket 16) and this ticket's six were merged into one file.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; Arabic written, not copied. *Verified: `svelte-check` 9279 files 0 errors and prettier clean on the effort branch; the child's eslint, node:test (902), vitest (85) and `cargo test` (285) runs are in its return.*

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,removal,command}.rs`;
`apps/desktop/src/lib/organization/component/members.svelte`, `organization/query.ts`,
`organization/router.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *An account is a username*.** The write follows `removal`'s row write.
- **[[rules/interface]], *Form surface*.**
- **A changeset rides with the change.**

## Notes

Built 2026-09-13. What a later reader needs:

- **The act is `Administration::InviteMember`.** The plan's "owner or administrator" maps to any
  of the three acts an administrator carries; invite was chosen because making an account is
  what invite is (spec requirement 22) and a rename changes the one thing an invitation named.
  The router's `member.rename` is `permitted('inviteMember')` for the same reason.
- **`rename_member` returns `MemberFacts`**, read back through `invite::members` after the write,
  so what the command hands the frontend is what the list will draw; `useRenameMember` uses none
  of it and invalidates `keys.members`. The refusals in order: unsettled, the act, the caller's
  own row, the rules, not found, removed, taken.
- **The owner's row can be renamed by an administrator.** The spec names the row and not the role
  and refuses only the holder's own; nothing in the plan exempts the owner, and `verified` lets
  any live certificate sign any member row, so the Rust function refuses only self and the list
  draws the control on every row but the reader's own. If the owner's username is meant to be the
  owner's alone, that is a spec sentence nobody has written, and one line in `rename_member`.
- **The refusal sentence is `organization.dashboard.usernameRules`**, `USERNAME_RULES` word for
  word in English, and `members.svelte.test.ts` reads the constant off `invite.rs` and pins the
  two together. The invite form still refuses an empty username with `nameRequired` today; ticket
  15's shared schema should read `usernameRules` and the `username` label added beside it, and
  may fold `rename-member-dialog.svelte`'s own spelling of the rule onto that schema, which
  would leave the rule in Rust and the router only.
- **The dialog lives inside `members.svelte`**, not on the page as the removal dialog does,
  because the criterion asks the list's own test to open it; the mutation stays the page's,
  awaited through `onRename(memberId, username): Promise<void>` so the list closes the surface on
  success and leaves it open on what was typed otherwise. The row's action block is now gated on
  `member.id !== selfId`, with reset, remove and lock-out still under `member.role !== 'owner'`
  inside it, so nothing the other three offered moved. `members.svelte.test.ts` renders under
  `DesignProvider` now, since the mounted form surface reads the contract.
- **Building here** needs `CARGO_TARGET_DIR` on a short path, as ticket 09's notes say; the
  gates below were run with it under the session's scratchpad.
