---
status: resolved
blocked-by: ['05', '06']
---

# fix(layout): the sign-in wall is minimal, names the organization, and guides

## Outcome

The locked wall reads as one clear card: the organization's name is its title, "sign in to
continue" its subtitle, username and password its only fields and "sign in" its one primary.
The two ways out of a jam, a link somebody was given and disconnecting this machine, sit
behind one quiet "trouble signing in?" disclosure at the foot, so a person who cannot sign in
finds them without either competing with the form. Signing out always lands on the wall,
whichever address the person was at.

## Acceptance Criteria

Traces requirements 9, 11 and 12 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as corrected on 2026-09-15
and criterion 11, and the human's first run of the build.

- [x] `layout/component/startup-sign-in.svelte`, locked: the card's heading is the held
      organization's name (`data-sign-in-organization` on it), a muted subtitle beneath it
      says sign in to continue, the labelled organization line is gone, the fields are
      username and password with their glyphs as today, and the primary is "sign in"; the
      signed-out-elsewhere and error callouts keep their place above the fields.
- [x] Beneath the form, one muted text control "trouble signing in?" (`data-sign-in-help`)
      discloses two text rows and nothing else: "open a link you were given" (the way to the
      connect screen, for a reset link) and "disconnect this machine" (the confirm dialog as
      today, whose description says what is lost and that the link connects again). Nothing
      of the two is drawn until the disclosure opens; the disclosure is a button with
      `aria-expanded`, keyboard reachable, and the rows are focusable in order.
- [x] No organization held: the heading is "welcome", the subtitle says an organization is
      created on your own turso account or joined with a link, and the two primaries stay
      (create organization, connect with link), one primary and one outline as today.
- [x] Signing out lands on the wall from any address: `shell-surface.ts` gains
      `addressAfterSignOut(pathname)` answering the way in for an address that opens signed
      out and `null` otherwise, with a `node:test`; `routes/+layout.svelte`'s sign-out listener
      navigates there before reading the standing, so `/settings` never keeps drawing over a
      signed-out machine.
- [x] `startup-sign-in.svelte.test.ts` asserts the heading, the subtitle, the absence of the
      labelled line, the disclosure closed by default and its two rows once opened, both in
      `en` and `ar`; every new string is written in both locales; `pnpm check`, `pnpm lint`
      and `pnpm test` pass; a changeset (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte`, `layout/shell-surface.ts`,
`routes/+layout.svelte`, `layout/tests/{startup-sign-in.svelte,shell-surface}.test.ts`,
`i18n/{en,ar}/index.ts`.

## Constraints

- **Why**: the human, on their first run (2026-09-15): the wall did not read well, the link
  control showed on a machine already connected, the disconnect felt oddly placed, and
  signing out did not reach the wall. Their direction: minimal yet elegant, clear language,
  a design that guides and stays accessible, and a person who cannot sign in must still be
  able to take this machine out of the organization from the wall.
- **[[rules/interface]]**: the wall stays on `StandaloneSurface`; the packaged primitives
  (`Field`, `InputGroup`, `Button`, `Callout`, the collapsible or disclosure primitive the
  design package offers) and nothing bespoke; Refactoring UI's *de-emphasise secondary
  actions* and *labels are a last resort* are the two pages this leans on.
- **Nothing about sign-in itself changes**: the same fields, the same command, the same
  refusals, the same remembered session.
- **The disclosure is the only new state**; it starts closed on every render.

## Notes

Built by an implementer and landed on 2026-09-15. Departures: `data-sign-in-organization`
sits on the card's body wrapper rather than on the heading, since the heading is
`StandaloneSurface`'s own `h1`, which takes a title string and spreads no rest props, and
widening the design package's API is not this ticket's; the test asserts the attribute and,
separately, that the heading reads the organization's name; the disclosed link row reuses
`useALink`; four locale keys retired rather than one (`organizationDescription`,
`organization`, `noOrganizationDescription` had no reader left); no chevron on the disclosure.

Raised, not taken: whether the disclosure reads as pressable without a chevron is the human's
to judge on screen; `StandaloneSurface` taking rest props would let the heading carry the
attribute.
