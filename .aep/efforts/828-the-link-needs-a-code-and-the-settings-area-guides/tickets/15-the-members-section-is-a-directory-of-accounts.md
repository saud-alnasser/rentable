---
status: resolved
blocked-by: ['14']
---

# feat(settings): the members section is a directory of accounts

## Outcome

The members section is a directory of record cards, one per account, the way domain records
are shown, for the owner and administrators; each card names the account and its standing and
carries its acts in the card's own menu; the owner's card is removed by nobody and edited by
nobody but the owner; an account is added from the foot on the form surface. The rows and the
row-actions block of ticket 07 are gone.

## Acceptance Criteria

Traces requirement 19 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 19
and 12.

- [x] `organization/component/members.svelte` draws the cards `complex/component/directory.svelte`
      draws, over `design/block/record-card.svelte`, one per account: the username, the role,
      the workspaces held and one line of standing (password not yet set, no machine signed in,
      a machine signed in) from the members query joined to the register (a read the members
      query gains); the card's `href` opens the account's edit surface in the section
      (`?section=members&account=<id>`); the card's `actions` are, by the same gates as today:
      edit (rename, role and permissions, workspaces and access), make a link, reset the
      password, sign out everywhere, remove; the owner's card carries none of these for an
      administrator and is not drawn with a menu, and carries the owner's own edits for the
      owner; the foot carries `add an account`, for a holder of `inviteMember`, opening the
      account form on the form surface; the section's sentence says accounts are made and
      changed here. `packages/design/src/lib/block/row-actions.svelte` and its test go, and the
      strings only the rows read go from both locales.
      *Verified 2026-09-16 on the effort branch: `members.svelte` draws `RecordCard`s with
      `actsOn` building the menu, `data-member-standing` per card, `recordOf(page.url)`
      opening the record named in the address; `row-actions.svelte` and its test are gone;
      `organization_member_standings` is registered in `lib.rs` and `member.standings` pinned
      in `router.test.ts`; `cargo test`: `386 passed`, with
      `a_standing_is_the_password_and_the_register_read_together` ok; the Rust half of
      criterion 19 is ticket 14's
      `an_account_is_made_with_no_link_and_its_first_link_sets_its_password`.*
- [x] `members.svelte.test.ts` finds, with an administrator session, one card per account with
      its standing, the add control at the foot, every act present or absent on the card's menu
      by its gate, and the owner's card without a menu; with the owner's session the owner's
      card offers the owner's edits; with a member session the area's test finds no section.
      *Verified: `vitest run` over `members.svelte.test.ts` and `area.svelte.test.ts`: `39
      passed`, the members file alone 22, covering one card per account, each standing line,
      the `href`, the address opening the edit, the acts per gate, the owner's card empty for
      an administrator and `workspaces and access` alone for the owner, the link act following
      the standing, and the add control after the last card; the member session's case stays
      the area's `a section this reader is not offered draws the default section`.*
- [x] The section was run against the human's organization from the run's worktree and the
      human looked at it before this ticket is resolved; what they said is recorded under Notes.
      *Verified 2026-09-16: the dev build from the run's worktree against the human's own
      organization, three looks. First look: four findings (plain words on the menu, no
      self-edits, the owner's own card empty, the primary in a tray above the cards like the
      contracts view), fixed on the branch. Second look: "everything looks good for members",
      one finding (the workspace chips), fixed: one counted line and the menu's workspaces
      entry. Third look: "Looks right, resolve 15".*
- [x] Every string in both locales; `pnpm check`, `pnpm lint` and `pnpm test` pass; the
      changeset of ticket 03 is extended.
      *Verified in the run's worktree: the three standing lines and the section sentence in
      both locales, Arabic written; no types drift; `pnpm check` exit 0 (desktop `9304 FILES 0
      ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `190 passed`); the
      changeset's members paragraph replaced with the directory's.*

## Relevant areas

`apps/desktop/src/lib/organization/component/{members,invite-form,link-handover}.svelte`,
`apps/desktop/src/lib/organization/{query,dialogs.svelte}.ts`,
`apps/desktop/src/lib/organization/tests/members.svelte.test.ts`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/settings/section.ts`,
`apps/desktop/src/lib/complex/component/directory.svelte` (read, as the shape),
`packages/design/src/lib/block/{record-card,row-actions}.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The
  directories*.**
- **[[rules/interface]], *Row activation* and *Record card actions***: activating a card opens
  its record; the acts are the card's menu.
- **The look is judged on real accounts**, never on mock data; the human is at the machine, so
  ask before driving the running application. Simple words, short lines.
- **The transfer act is ticket 17's**; leave room for it in the owner's menu and draw nothing.

## Notes

- *2026-09-16, at integration.* Five things the child raised, accepted: the parenthesis in
  "edit (rename, role and permissions, workspaces and access)" is read as the three acts 826
  gates separately, so a card's address opens the fullest edit this reader holds rather than a
  composite form; the owner's own edits resolve to workspaces and access alone, since Rust
  refuses a self-rename and a self-role-change; revoke left the section, since requirement 19's
  menu does not list it (a stale link is superseded by resetting the password or making a new
  link; the Rust act and its hook stay); the screens say "member" where the spec says account;
  `PendingInvitation` on the web side has no reader. `invitation_link`, `invitation.link` and
  `useInvitationLink` were removed from the boundary, the Rust reader of the issuer copy
  staying as the column's one reader; the credentials rule's aside naming them was corrected.
- *Second and third looks, 2026-09-16.* "everything looks good for members; but the workspaces
  in the record card feels odd; maybe an option from dropdown to view them or something like
  that; also what is the difference from remove and remove and lockdown". The chips became one
  counted line (`2 workspaces`, `1 workspace`, `no workspace yet`), the menu's workspaces
  entry opening the surface that lists every workspace with the access held; the difference
  between remove and lock out was explained (remove stops renewing, lock out also rotates the
  workspace databases held). Then: "Looks right, resolve 15". The tray is
  `organization/component/directory-tray.svelte`, reusable by ticket 16; a reader's own card
  offers nothing, since Rust refuses a self-rename; the counted line uses typesafe-i18n's real
  plural rather than the `(s)` habit the layer has elsewhere, which is raised, not taken.
