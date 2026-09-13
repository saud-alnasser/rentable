---
status: resolved
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

- [x] `member` in `organization/store.rs` carries `username_sealed` and neither `email_sealed` nor
      `display_name_sealed`; `members()` reads it; `grep -c "email" apps/desktop/tauri/src/organization`
      finds only the diagnostics and comments that say the field is gone, none reading a row. *Verified 2026-09-13 on the effort branch (`1dec4694`): `grep -rc "email" apps/desktop/tauri/src/organization | grep -v ":0$"` printed nothing; `store.rs`'s schema and `signed_members` name `username_sealed` only.*
- [x] `invite::validate_username` refuses under three and over thirty-two characters and any
      character outside letters, digits, `.`, `_` and `-`, and accepts the limits; a table test in
      `invite.rs` says so. `invite_member` and `create_organization` refuse through it with one
      sentence, and refuse a username already taken in any case (`alice` against `Alice`) with
      another. *Verified: `cargo test` on the effort branch printed `283 passed; 0 failed; 10 ignored`, including `a_username_is_three_to_thirty_two_of_letters_digits_dot_underscore_and_hyphen`, `a_username_already_held_is_refused_in_any_case` and setup's `an_empty_name_a_bad_username_or_a_short_password_is_refused_before_any_request`.*
- [x] `create_organization(name, username, password, ...)` writes the owner's row with the
      username; `invite_member` writes the member's; `MemberFacts`, `MemberSession`'s facts,
      `OrganizationSession` and `OrganizationMember` in `host.ts` carry `username` and lose
      `email`, `displayName` and `ownerDisplayName` (`ownerUsername` in its place). *Verified: the same run, setup's first-run test opens the owner's `username_sealed`; `session.rs` tests read `facts.username` and `facts.owner_username`; `host.ts` carries `username` and `ownerUsername` and no `email` or `displayName` (`grep`).*
- [x] `cargo test` passes with every test that named an email or a display name rewritten to a
      username, and `pnpm check` passes on the desktop with the host types changed and every
      consumer compiling (the screens may read `username` where they read `displayName`; their
      redraw is ticket 15's). *Verified: `cargo test` 283 passed; `svelte-check` 9275 files 0 errors on the effort branch; the child's runs of prettier, eslint, node:test (901) and vitest (79) are recorded in its return.*

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

## Notes

Landed 2026-09-13. Five things a later reader needs, each inside the plan's bounds:

- **The uniqueness check has the shape ticket 12 calls**:
  `invite::refuse_taken_username(store, session, username, except: Option<&str>)`, where `except`
  is the member id whose own row is not counted, so a rename can keep a username under another
  case. An invitation passes `None`. Both sentences are constants beside it, `USERNAME_RULES` and
  `USERNAME_TAKEN`, so ticket 15's shared schema can repeat the first word for word.
- **`create_organization` validates the shape only.** The owner is the first member, so nobody
  holds the username yet and there is no store to compare against; uniqueness is an invitation's
  and a rename's.
- **`join::restore` lost its empty-identifier allowance.** It let an empty email pass for the
  owner, whose row carried none; every row names its member now, so an empty username is refused
  like a wrong one. The function goes with ticket 11 either way.
- **The frontend bridge until ticket 15.** The walk's `name` step collects no username yet, so
  `routes/organization/new/+page.svelte` sends `username: ''` and the router refuses it before
  the host is reached (`USERNAME` in `organization/router.ts`, min 3, max 32, the character set);
  the walk cannot create an organization until ticket 15 adds the field. The invite form's two
  fields became one `username` field under the existing `common.labels.name` label and
  `nameRequired` message, with no new string; the email and secondary-line renderings in the
  account menu, identity block and both members lists are gone rather than pointed at the
  username twice. `dashboard.email` and `dashboard.emailInvalid` are now unread strings for
  ticket 15 to retire.
- **Building in this worktree.** The worktree's path pushes `link.exe`'s output past Windows'
  260-character limit (265 for a build-script executable), so every cargo command here needs
  `CARGO_TARGET_DIR` pointed somewhere short; the gates above were run with it in the session's
  scratchpad. Clippy's five warnings are all pre-existing and outside the organization module.
