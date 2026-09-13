---
status: open
blocked-by: ['03', '05']
---

# feat(organization): the connect screen takes either link, and the wall points at it

## Outcome

One field takes an organization link or an invitation link: the first connects the machine and
lands on the wall, the second names the organization and the username and asks for a
password, and on submit the person is signed in and inside their first workspace; a lapsed,
consumed or revoked link, and a link for another organization, are refused by name on the
screen. The locked wall carries a way to this screen for a person holding a reset link.

## Acceptance Criteria

Traces requirement 10 and requirement 11 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 10,
criterion 11 and criterion 8 (the screen half).

- [ ] `organization/component/join-screen.svelte` has the steps `paste`, `inspecting`,
      `unreadable`, `unreachable`, `refused` and `password`; `refused` names which of lapsed,
      consumed, revoked or another organization; `password` shows the organization's name and
      the username as text, a password and a confirmation at `PASSWORD_FLOOR` with the floor
      sentence, a primary "join" carrying its glyph, and the corner back to `paste`.
- [ ] The route inspects on paste; an organization link runs `connect` then
      `startup.standingChanged()` (the wall); an invitation link runs `connect` where nothing
      is held, shows `password`, and on submit runs `invitation.accept` then
      `startup.standingChanged()`, which enters the application. `organization/join.ts` holds
      the step transitions and `linkKind(facts)`, tested under `node:test`.
- [ ] `join-screen.svelte.test.ts` renders both link kinds from one field and asserts the
      landing step of each, the four refusals, and the password step's fields and glyphs.
- [ ] The locked wall renders one text control beside disconnect that navigates to the connect
      screen; `startup-sign-in.svelte.test.ts` finds it, and the wall's title, description and
      fields are otherwise unchanged.
- [ ] Every new string is written in both locales, not copied.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/src/lib/organization/component/join-screen.svelte`, `organization/join.ts`,
`routes/organization/join/+page.svelte`, `layout/component/startup-sign-in.svelte`,
`layout/shell-surface.ts` (read), `i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Components* (the
  connect screen row) and *Operational Considerations*.**
- **[[rules/interface]]**, *Application surfaces*: the screen stays on `StandaloneSurface`,
  tone `neutral`; the corner back is `SurfaceAction`.
- **The rename to `connect-screen` is ticket 12's**, so the file keeps its name here.
- **A link for another organization while one is held is refused with the disconnect-first
  sentence**; a reset link for the held organization is accepted from the wall.

## Notes

Nothing yet.
