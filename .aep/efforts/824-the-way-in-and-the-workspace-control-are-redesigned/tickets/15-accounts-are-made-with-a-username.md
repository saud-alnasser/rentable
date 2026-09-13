---
status: resolved
blocked-by: [09, 11]
---

# feat(organization): accounts are made with a username

## Outcome

Every form and list that named a member by email and display name reads and writes a username:
the walk's `name` step, the invite dialog and its result panel, the members list, the pending
accounts list, the identity block, and the organization page's two sentences.

## Acceptance Criteria

Traces requirement 3, requirement 21, requirement 22, requirement 25 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 3, criterion 12, criterion 21 (the forms' half), criterion 22 and criterion 25.

- [x] `SetupField` gains `username`; the walk's `name` step presents `name`, `username` and
      `password`, each with its glyph; `setup.test.ts` holds `fieldsPresented`; the create calls
      the port with the username. *Verified 2026-09-13 on the effort branch: node:test 909 pass includes `setup.test.ts`'s `fieldsPresented` case (`name`, `username`, `password`, `workspace`); vitest's `setup-walk.svelte.test.ts` holds the three inputs in order with their addons; the route sends `{ name, username, password }`.*
- [x] `invite-form.svelte.test.ts`: inputs `username`, `role` and the workspace checkboxes, no
      `email` or `displayName`; the result panel renders the organization's link, the username and
      the password with a copy control each, and the cannot-send sentence. *Verified: vitest on the effort branch, `invite-form.svelte.test.ts` 13 passed: inputs `username` and the workspace checkboxes plus the role select, no email or display name, three copy controls and the cannot-send sentence in the result.*
- [x] The walk's `name` step and the invite dialog refuse a username outside requirement 21's
      rules with the same sentence, pinned in one schema module both import. *Verified: `setup.test.ts` pins `usernameSchema` in both locales; the walk's and the invite form's tests read `organization.dashboard.usernameRules` on leaving the field; `members.svelte.test.ts` pins that sentence to Rust's `USERNAME_RULES`.*
- [x] `members.svelte`, `invitations.svelte` and `identity.svelte` render the username and no
      email or display name; the invitations section is titled as pending accounts; the link
      section's sentence says the link with a username and password is the way in. Asserted in
      the section tests in both locales. *Verified: vitest on the effort branch, `members.svelte.test.ts` 14, `invitations.svelte.test.ts` 4, `identity.svelte.test.ts` 2, `organization-link.svelte.test.ts` 2 passed; the pending accounts title is read from both locales in `i18n/tests/organization.test.ts`, since routes do not render under vitest.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; Arabic written, not copied. *Verified on the effort branch after the two confirms were folded into one (`disconnect-dialog.svelte`, see Notes): `svelte-check` 9287 files 0 errors; node:test 909 pass; vitest 107 passed in 16 files; prettier clean; eslint 0.*

## Relevant areas

`apps/desktop/src/lib/organization/{setup.ts,component/setup-walk.svelte,component/invite-form.svelte,component/members.svelte,component/invitations.svelte,component/identity.svelte,component/organization-link.svelte}`,
`routes/organization/new/+page.svelte`, `routes/organization/+page.svelte`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *An account is a username*.**
- **The username schema is one definition**, as the workspace form is (ticket 01), imported by
  both forms.
- **A changeset rides with the change.**

## Notes

Built 2026-09-13. What a later reader needs, each inside the plan's bounds:

- **The one username schema is `organization/username-form.ts`**: `USERNAME_MIN`, `USERNAME_MAX`,
  `USERNAME_PATTERN` and `usernameSchema(translations)`, a string schema (trimmed, every bound
  refused with `organization.dashboard.usernameRules`) that the walk's `name` step, the invite
  dialog and the rename dialog each put under their own `username` key. The rename dialog's own
  spelling of the rule was folded onto it, as ticket 12's notes offered, and the router's
  `USERNAME` reads the three limits, so the rule is in Rust and in this module and nowhere
  else. `setup.test.ts` pins the bounds and the sentence in both locales;
  `members.svelte.test.ts` still pins the English sentence to Rust's `USERNAME_RULES`.
- **The walk.** `SetupField` gains `username`; the `name` step is `name`, `username`,
  `password`, each in an `input-group` (building, user, key glyphs); `onCreate(name, username,
  password)`; the route's `username: ''` stub is gone. `setup.nameDescription` mentions the
  username now and `setup.usernameLabel` ("your username") was added. No description line under
  the username field: the refusal sentence is the explanation, as on the rename dialog.
- **The invite dialog** asks for `username` under `organization.dashboard.username`, then the
  role and the workspaces; the result panel draws the link (titled `dashboard.linkTitle`, the
  same words as the page's section, since `dashboard.linkLabel` said "join link" and a link is
  the organization's now), the username and the password, each with a copy control.
  `InvitedCopy` (`'link' | 'username' | 'password'`) lives in `organization/dialogs.svelte.ts`
  beside `invited`, and `organization-dialogs.svelte`'s `copied` is typed on it. Retired from
  both locales: `dashboard.email`, `dashboard.emailInvalid`, `dashboard.nameRequired`,
  `dashboard.linkLabel`. Renamed: `dashboard.invitations` to `pendingAccounts`,
  `dashboard.noInvitations` to `noPendingAccounts`. Reworded: `inviteDescription`,
  `cannotSend` (names all three), `linkDescription` (the link with a username and a password is
  the way in; nothing about restoring), and the Arabic `linkTitle`, which said "المنظمة" where
  every other string says "المؤسسة".
- **The lists.** `members.svelte` draws `member.username` with no role fallback (every row
  names its member since ticket 09) under `data-member-username`; `invitations.svelte` is the
  pending accounts list (`data-pending-accounts`, `data-pending-username`); `identity.svelte`
  draws `session.username` alone, avatar included, under `data-identity-username`. New section
  tests: `invitations.svelte.test.ts`, `identity.svelte.test.ts`,
  `organization-link.svelte.test.ts`. The last renders the link section for a non-owner so its
  query stays disabled, through a new fixture `tests/query-providers.svelte` (`DesignProvider`
  over a fresh `QueryClientProvider`), the first fixture here for a section that owns a query.
  The pending accounts title is the page's own string and routes are not rendered under vitest,
  so it is read in `i18n/tests/organization.test.ts` in both locales, beside the three-things
  sentence.
- **The page's disconnect, for the orchestrator to fold with ticket 14's.** A new
  `organization/component/disconnect.svelte` takes `organizationName` and
  `onDisconnect: () => Promise<void>`, draws a sentence (`dashboard.disconnectForgets`) and an
  outline button with the `unplug` glyph (`dashboard.disconnect`, `data-disconnect-open`), and
  asks once on the design package's `DeleteDialog`, the surface every destructive act asks on,
  with the organization as the record, `dashboard.disconnectTitle` as the title and
  `dashboard.disconnectCost` under the name. The page mounts it as the last section under
  `dashboard.disconnectTitle`. The mutation is a new `useDisconnectOrganization()` in
  `organization/query.ts` over `api.app.organization.disconnect()` (the public procedure ticket
  10 landed), with a success toast `dashboard.disconnected`; it invalidates nothing, because the
  page then calls `startup.standingChanged()`, which reads the emptied record, admits nobody,
  and raises the wall with `signInReason: 'noOrganization'`, clearing the whole cache on the way.
  `startup.disconnect()` did not exist on this base, so the page reaches the host through the
  router as the brief allowed. A `BAD_REQUEST` from the command stays on the confirm verbatim;
  anything else is the shared handler's toast and the confirm stays open. Whatever ticket 14
  built for the wall's confirm can take this component's strings or hand it its own; the
  dialog and the sentences are the only things to reconcile.
- **Two comments left as they were.** `routes/account/+page.svelte`'s docstring still says "the
  name, the address"; the account page's frame is outside the spec's scope. `workspace/component/sync.svelte`
  refers to a workspace identity block, not this one.
- **Gates.** `pnpm install` was needed in this worktree; the pieces were run as the brief says
  (svelte-check, prettier, eslint, `node:test`, vitest), all green; no Rust changed, so cargo was
  not run, and the design package was not touched.

**Folded at integration, 2026-09-13.** Ticket 14's `disconnect-dialog.svelte` and this ticket's
own `DeleteDialog` inside `disconnect.svelte` asked the same question twice over. The page's
section now mounts the wall's dialog, the legend reads `layout.signIn.disconnect`, and
`dashboard.disconnectTitle` and `dashboard.disconnectCost` are retired from both locales;
`disconnectForgets`, `disconnect` and `disconnected` stay as the section's sentence, its button
and its toast.

