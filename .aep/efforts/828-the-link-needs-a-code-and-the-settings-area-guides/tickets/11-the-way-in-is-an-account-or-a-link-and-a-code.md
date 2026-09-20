---
status: resolved
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

- [x] `layout/component/startup-sign-in.svelte`, in its no-organization state, draws the two
      controls it draws today each with one sentence under it, the account's saying it is for
      whoever owns the organization, new or already there, the link's saying it is what an
      administrator or a member handed over, and the strings under `layout.signIn` are rewritten
      to say so; no string on that screen names a group, a database or a consent. The layout
      test that renders that state finds the two controls, the two sentences, and none of those
      three words.
      *Verified 2026-09-16 on the effort branch: the no-organization state draws the two
      controls with one sentence each; `vitest run
      src/lib/layout/tests/startup-sign-in.svelte.test.ts`: 16 passed, the rewritten test
      asserting two buttons, both sentences and none of group, database or consent in either
      locale; the `signIn` strings hold none of the three words. At the human's word the
      sentences were cut to plain words at integration: `you own the organization.` and `you
      were given a link and a code.`*
- [x] `organization/connect.ts`: the `paste` step carries `code` beside `link`; `reading` takes
      both; `afterRead` runs the machine connect at once for a machine link with the held code
      and enters `password` for an invitation with the code held, so `password` is the two
      password fields alone; the `code` step goes; `joinFailed` on the `paste` step marks the
      link field for a decode refusal and the code field for `forbidden` and `invalidInput`, and
      lands lapsed, consumed, revoked and replaced on `refused` as today; `connect.test.ts`
      follows.
      *Verified: `connect.ts` has no `code` or `unreadable` step kind; `paste` carries `link`,
      `code`, `isUnreadable`, `codeRefusal`; `afterRead(link, code, shape)` answers the wall
      for a machine link and the `password` step for an invitation; `node --import tsx --test
      src/lib/organization/tests/connect.test.ts`: `tests 15, pass 15, fail 0`. The decode
      refusal is marked by `inspectionFailed` on the paste step and the code refusals by
      `joinFailed`, since both arrive as `invalidInput`; see Notes.*
- [x] `connect-screen.svelte` draws the `paste` step as the link field and the code field with
      one continue, and the `password` step as the two password fields; `routes/organization/join/+page.svelte`
      reads, then runs `machine.connect(link, code)` or, after the password step,
      `invitation.accept(link, code, password)`; `connect-screen.svelte.test.ts` finds both fields
      on the first step before any link is read, the two password fields after an invitation is
      read, a machine link connecting with no further field, an unreadable link marking the link
      field and a wrong code marking the code field.
      *Verified: the route calls `linkRead` (line 98), `machineConnect(link, code)` (114) and
      `invitation.accept(link, code, password)` (156); `vitest run
      src/lib/organization/tests/connect-screen.svelte.test.ts`: 27 passed, including both
      fields before any read, the two password fields after an invitation, a machine link
      connecting with no further field, an unreadable link marking the link field and a wrong
      code marking the code field.*
- [x] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended with one line on the first
      screen and the one form.
      *Verified in the run's worktree: strings in `en` and `ar`, Arabic written, types
      regenerated with no drift; the locale tests pass; `pnpm check` exit 0 (desktop `9305
      FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `185
      passed`); the changeset carries the first screen's line.*

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

- *2026-09-16, at integration.* The decode and the acts both answer `invalidInput` for two
  different fields, so one function could not tell a non-link from an untyped code: the read's
  refusal is caught apart and `inspectionFailed(link, code, error, describe)` marks the link
  field on the paste step, and `joinFailed` marks the code field. The `unreadable` step kind
  folded into `paste.isUnreadable`, since it drew the same form. A link the operating system
  hands over lands in the field with the code still to type, since nothing can be acted on
  without the code.
- The human, seeing the first screen in the running build, asked for simple words and shorter
  lines under the options; the six strings were cut at integration in both locales (the
  subtitle, the two option sentences, the connect form's title, description and the two field
  labels).
