---
status: open
blocked-by: [09, 11]
---

# feat(organization): accounts are made with a username

## Outcome

Every form and list that named a member by email and display name reads and writes a username:
the walk's `name` step, the invite dialog and its result panel, the members list, the pending
accounts list, the identity block, and the organization page's two sentences.

## Acceptance Criteria

Traces requirement 3, requirement 21, requirement 22, requirement 25 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 3, criterion 12, criterion 21 (the forms' half), criterion 22 and criterion 25.

- [ ] `SetupField` gains `username`; the walk's `name` step presents `name`, `username` and
      `password`, each with its glyph; `setup.test.ts` holds `fieldsPresented`; the create calls
      the port with the username.
- [ ] `invite-form.svelte.test.ts`: inputs `username`, `role` and the workspace checkboxes, no
      `email` or `displayName`; the result panel renders the organization's link, the username and
      the password with a copy control each, and the cannot-send sentence.
- [ ] The walk's `name` step and the invite dialog refuse a username outside requirement 21's
      rules with the same sentence, pinned in one schema module both import.
- [ ] `members.svelte`, `invitations.svelte` and `identity.svelte` render the username and no
      email or display name; the invitations section is titled as pending accounts; the link
      section's sentence says the link with a username and password is the way in. Asserted in
      the section tests in both locales.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; Arabic written, not copied.

## Relevant areas

`apps/desktop/src/lib/organization/{setup.ts,component/setup-walk.svelte,component/invite-form.svelte,component/members.svelte,component/invitations.svelte,component/identity.svelte,component/organization-link.svelte}`,
`routes/organization/new/+page.svelte`, `routes/organization/+page.svelte`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *An account is a username*.**
- **The username schema is one definition**, as the workspace form is (ticket 01), imported by
  both forms.
- **A changeset rides with the change.**
