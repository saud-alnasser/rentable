---
status: open
---

# feat(organization): an account is a username

## Outcome

The organization database names a member by a sealed username and nothing else: `email_sealed`
and `display_name_sealed` are gone from `member`, `create_organization` takes the owner's
username, `invite_member` takes a username, a role and workspaces, and every Rust reader of an
email or a display name reads the username instead. A username is validated once, in one place,
and is unique within the organization without regard to case. The facts the frontend types read
(`OrganizationSession`, `OrganizationMember`, `MemberFacts`) carry `username`.

## Acceptance Criteria

Traces requirement 21 and requirement 17 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 21 and criterion 16.

- [ ] `member` in `organization/store.rs` carries `username_sealed` and neither `email_sealed` nor
      `display_name_sealed`; `members()` reads it; `grep -c "email" apps/desktop/tauri/src/organization`
      finds only the diagnostics and comments that say the field is gone, none reading a row.
- [ ] `invite::validate_username` refuses under three and over thirty-two characters and any
      character outside letters, digits, `.`, `_` and `-`, and accepts the limits; a table test in
      `invite.rs` says so. `invite_member` and `create_organization` refuse through it with one
      sentence, and refuse a username already taken in any case (`alice` against `Alice`) with
      another.
- [ ] `create_organization(name, username, password, ...)` writes the owner's row with the
      username; `invite_member` writes the member's; `MemberFacts`, `MemberSession`'s facts,
      `OrganizationSession` and `OrganizationMember` in `host.ts` carry `username` and lose
      `email`, `displayName` and `ownerDisplayName` (`ownerUsername` in its place).
- [ ] `cargo test` passes with every test that named an email or a display name rewritten to a
      username, and `pnpm check` passes on the desktop with the host types changed and every
      consumer compiling (the screens may read `username` where they read `displayName`; their
      redraw is ticket 15's).

## Relevant areas

`apps/desktop/tauri/src/organization/{store,invite,setup,session,password,removal,vault,workspace,command}.rs`;
`apps/desktop/src/lib/platform/host.ts`, `platform/tauri.ts`, `organization/router.ts`,
`api/context.ts`; `sync/oauth/authorization.rs` and `diagnostics/record.rs` where an email is
named.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *An account is a username*.**
- **[[rules/credentials]]**: the username is sealed under the content key like the email it
  replaces; nothing about a member is readable from a row without an open vault.
- **No migration** (spec requirement 17): the schema changes in place; ticket 10 is what forgets
  the old shape.
- **A changeset rides with the change.**
