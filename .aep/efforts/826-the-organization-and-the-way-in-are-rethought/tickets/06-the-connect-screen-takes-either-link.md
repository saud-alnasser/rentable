---
status: resolved
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

- [x] `organization/component/join-screen.svelte` has the steps `paste`, `inspecting`,
      `unreadable`, `unreachable`, `refused` and `password`; `refused` names which of lapsed,
      consumed, revoked or another organization; `password` shows the organization's name and
      the username as text, a password and a confirmation at `PASSWORD_FLOOR` with the floor
      sentence, a primary "join" carrying its glyph, and the corner back to `paste`.
- [x] The route inspects on paste; an organization link runs `connect` then
      `startup.standingChanged()` (the wall); an invitation link runs `connect` where nothing
      is held, shows `password`, and on submit runs `invitation.accept` then
      `startup.standingChanged()`, which enters the application. `organization/join.ts` holds
      the step transitions and `linkKind(facts)`, tested under `node:test`.
- [x] `join-screen.svelte.test.ts` renders both link kinds from one field and asserts the
      landing step of each, the four refusals, and the password step's fields and glyphs.
- [x] The locked wall renders one text control beside disconnect that navigates to the connect
      screen; `startup-sign-in.svelte.test.ts` finds it, and the wall's title, description and
      fields are otherwise unchanged.
- [x] Every new string is written in both locales, not copied.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

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

Built by an implementer and landed on 2026-09-14. Departures from the literal criteria, on the
orchestrator's reading of the owner's note that one person signs in on many machines: the
`consumed` refusal says the link was already opened and offers one primary to the wall, since
the same link pasted on a second machine has connected it and the password chosen the first
time is what opens it; `lapsed` and `revoked` carry Rust's sentence and offer nothing;
`anotherOrganization` says disconnect first with the shell's sentence beneath. The route runs
inspect, then connect on every readable link, then judges: `invitation_accept` refuses a
machine holding nothing, so a refused link on a fresh machine ends connected, which is
harmless for a person waiting on a new link. `linkKind` reads the standing rather than the
invited username, since a consumed link comes back with no username. The password step reuses
the walk's floor sentences; `confirmLabel` and `mismatch` are new under `organization.join`,
the primary is `common.actions.join`, the wall's control `layout.signIn.useALink`.

Raised, not taken: `linkInspect` then `connect` open the replica twice; the route calls the
host command for the accept rather than the router procedure, which stays as the gate for
other callers; an accept refused after the password is typed stays on the password step with
the shell's sentence. Ticket 15 adds the code field to the password step.
