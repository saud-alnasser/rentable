---
status: open
blocked-by: [09]
---

# feat(organization): an account can be renamed

## Outcome

The owner or an administrator renames a member from the members list; the row is re-sealed and
re-signed by the actor; a member cannot rename themselves.

## Acceptance Criteria

Traces requirement 23 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 23.

- [ ] `member_rename(member_id, username)` validates through ticket 09's `validate_username`,
      refuses a taken username, re-seals and re-signs the row under the actor's signer, and is
      refused for a session whose `member_id` is the target and for one without the permission.
      Asserted in Rust: rename by the owner is read back by `members()`; the three refusals.
- [ ] A rename row on each member in `members.svelte` opens a light `FormSurface` with one
      username field carrying its glyph and a verb glyph on its button; the dialog reads the same
      refusal sentence the invite form does. Asserted in `members.svelte.test.ts`.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; Arabic written, not copied.

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,removal,command}.rs`;
`apps/desktop/src/lib/organization/component/members.svelte`, `organization/query.ts`,
`organization/router.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *An account is a username*.** The write follows `removal`'s row write.
- **[[rules/interface]], *Form surface*.**
- **A changeset rides with the change.**
