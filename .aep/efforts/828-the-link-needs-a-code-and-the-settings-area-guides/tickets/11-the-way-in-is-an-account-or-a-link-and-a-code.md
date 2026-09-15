---
status: open
---

# feat(organization): the way in is an account or a link and a code

## Outcome

A machine holding no organization offers two ways in and says what each needs: the Turso
account, for whoever owns the organization, made or already there; and a link with its code,
what an administrator or a member handed over. The connect screen is one form taking the link
and the code together; an invitation then asks the person to choose their password, and a
second-machine link connects at once. An unreadable link and a wrong code are refused on their
own fields.

## Acceptance Criteria

Traces requirements 13 and 17 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 13,
17 and 12.

- [ ] `layout/component/startup-sign-in.svelte`, in its no-organization state, draws the two
      controls it draws today each with one sentence under it, the account's saying it is for
      whoever owns the organization, new or already there, the link's saying it is what an
      administrator or a member handed over, and the strings under `layout.signIn` are rewritten
      to say so; no string on that screen names a group, a database or a consent. The layout
      test that renders that state finds the two controls, the two sentences, and none of those
      three words.
- [ ] `organization/connect.ts`: the `paste` step carries `code` beside `link`; `reading` takes
      both; `afterRead` runs the machine connect at once for a machine link with the held code
      and enters `password` for an invitation with the code held, so `password` is the two
      password fields alone; the `code` step goes; `joinFailed` on the `paste` step marks the
      link field for a decode refusal and the code field for `forbidden` and `invalidInput`, and
      lands lapsed, consumed, revoked and replaced on `refused` as today; `connect.test.ts`
      follows.
- [ ] `connect-screen.svelte` draws the `paste` step as the link field and the code field with
      one continue, and the `password` step as the two password fields; `routes/organization/join/+page.svelte`
      reads, then runs `machine.connect(link, code)` or, after the password step,
      `invitation.accept(link, code, password)`; `connect-screen.svelte.test.ts` finds both fields
      on the first step before any link is read, the two password fields after an invitation is
      read, a machine link connecting with no further field, an unreadable link marking the link
      field and a wrong code marking the code field.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended with one line on the first
      screen and the one form.

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test,
`apps/desktop/src/lib/organization/{connect.ts,component/connect-screen.svelte}`,
`apps/desktop/src/routes/organization/join/+page.svelte`,
`apps/desktop/src/lib/organization/tests/{connect,connect-screen.svelte}.test.ts`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The way in
  is an account or a link and a code*.**
- **The organization link still decodes in this ticket** and takes its wall path with an empty
  code; ticket 12 retires it. Do not remove it here.
- **[[rules/interface]], *Validation errors***: a refusal marks its field.
- **The screen holds the link's text and the code, never a credential.**

## Notes
