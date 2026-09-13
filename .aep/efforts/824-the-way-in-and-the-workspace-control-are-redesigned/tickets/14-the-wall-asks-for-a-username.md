---
status: open
blocked-by: [11]
---

# feat(layout): the wall asks for a username

## Outcome

The wall names the held organization and asks for a username and a password; a disconnect link
under it asks once and forgets the organization on this machine.

## Acceptance Criteria

Traces requirement 7, requirement 19, requirement 20, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 7 and criterion 20 (the component half).

- [ ] With one held organization, `startup-sign-in.svelte.test.ts` finds its name as text, inputs
      named `username` and `password` and nothing else that takes input, no `select` and no
      `[role=radio]`; submitting calls `onSignIn(username, password)`; the unlock carries a glyph
      and both fields a muted leading one.
- [ ] `startup.signIn(username, password)` calls the port with both and runs the stages a sign-in
      runs; `startup.test.ts` holds it.
- [ ] A disconnect control on the wall while signed out opens the confirm; confirming calls the
      disconnect port and the state returns to `noOrganization`. Asserted in the component test
      and in `startup.test.ts`.
- [ ] The wall's title and description are unchanged in both locales; the username label and the
      disconnect sentences are written in both.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test, `layout/startup.ts`,
`layout/startup-ports.ts`, `sync/admission.ts`, the locales.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The wall is a login page*.**
- **The wall's shape is the human's, settled 2026-08-20**: a title, a line, the way in. The
  username field sits above the password; the disconnect is a link at the foot beside the two
  that are there.
- **A changeset rides with the change.**
