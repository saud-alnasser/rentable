---
status: open
blocked-by: ['04', '08', '09']
---

# feat(organization): the members section is one list

## Outcome

The members section is one list of rows, active and pending alike, each carrying the username,
the avatar, the role, the workspaces held with their access and a pending mark with its
expiry; each row action sits behind its act; the invite dialog asks for a username, a role and
per workspace an access, and its result is one link with one copy control, the same panel a
new link and a copy link show.

## Acceptance Criteria

Traces requirement 15, requirement 8 (the dialog and its result) and requirement 6 (what the
list shows) of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its
criterion 15, criterion 8 (the dialog half) and criterion 6 (the list half).

- [ ] `organization/component/members.svelte` renders one row per member from `MemberFacts`:
      avatar initials, username, role badge, the workspaces with `full` or `read-only`, and for
      a pending row the mark with its expiry; row actions are change role and permissions
      (`changeRole`, opening `role-dialog.svelte`), workspaces and access (`grantWorkspace`,
      opening `access-dialog.svelte`), rename (`renameMember`), new link (`resetPassword`),
      remove (`removeMember`, the `DeleteDialog` with lock out for the owner and its cost), and
      on a pending row copy link (for its issuer), new link and revoke (`inviteMember`).
- [ ] `role-dialog.svelte` offers the three roles and a checkbox per grantable act, with the
      signing acts drawn refused for a caller who is not the owner and the sentence naming the
      owner; `access-dialog.svelte` offers every workspace with none, full or read-only,
      read-only drawn refused for a non-owner; both are light `FormSurface`s.
- [ ] `invite-form.svelte` asks for a username, a role and per workspace a checkbox with an
      access choice; its result renders the organization's name, one link and one copy control
      and the cannot-send sentence; `invitations.svelte` and its test do not exist.
- [ ] `dialogs.svelte.ts`'s `invited` carries a link and a username and is shown by invite, new
      link and copy link alike.
- [ ] `members.svelte.test.ts` renders an active row and a pending row with every field, finds
      each action present only when the session permits its act, finds copy link only for the
      issuer, and finds the invite button opening the dialog; `invite-form.svelte.test.ts` finds
      the access choice and one copy control; the two dialogs have tests of their own.
- [ ] Every string is written in both locales; `organization.dashboard.pendingAccounts` and the
      pending list's strings are gone.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/src/lib/organization/component/{members,invite-form,invitations,role-dialog,access-dialog,rename-member-dialog}.svelte`,
`organization/{dialogs.svelte.ts,query.ts}`, `layout/component/organization-dialogs.svelte`,
`settings/component/area.svelte`, `i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Components* (the
  members rows), and ticket 08's write-up for the row's look.**
- **[[rules/interface]]**, *Form surface* and *Validation errors*; *Row activation*: a row's
  action is a control on the row, never the row.
- **The two organization dialogs stay mounted in the shell**; the section opens them.
- **Every gate is drawn from the session's permissions and refused again in Rust**; a control
  for an act the session lacks is absent, not disabled, except the owner-only sentences the
  spec names.

## Notes

Nothing yet.
