---
status: resolved
blocked-by: ['23']
---

# feat(settings): the settings area has four sections

## Outcome

The settings area has four sections named for what they hold: general (general, updates,
diagnostics), account (the you blocks), organization (the members directory, the Turso account
block, deleting the organization), workspaces (the directory with export and import). Every
address naming a retired section opens the section that holds it, every link into the area
names the new one, and the gates stay as they were.

## Acceptance Criteria

Traces requirement 24 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 24
and 12.

- [x] `settings/section.ts`: `SettingsSection` is `general | account | organization |
      workspaces`, with a map from each retired name (`you`, `members`, `sync`, `updates`,
      `diagnostics`) to the section that holds it, read by `withSection` and by the area's
      address reading; `DEFAULT_SECTION` stays general; `section.test.ts` asserts the map and
      that a retired name resolves.
      *Verified 2026-09-16 on the effort branch: `SETTINGS_SECTIONS` is the four,
      `SECTION_HOLDING` maps the five retired names, read by `holdingSection`, `withSection`
      and `sectionOf`; `DEFAULT_SECTION` unchanged; `section.test.ts` in the node run of 33
      passing.*
- [x] `settings/component/area.svelte` draws the four: general with the general blocks, then
      updates and diagnostics under their own legends; account with the you blocks; organization
      with the members directory, then the authority block and the delete; workspaces with the
      directory and the transfer beneath; every gate keeps its prop, so a member's organization
      section draws what the sync section drew for a member and no directory; the four names in
      both locales under `settings.section`, the retired names removed, `i18n-types.ts`
      regenerated; the rail's row and every other link into the area names a live section.
      *Verified: the area draws the four (general with updates and diagnostics under their own
      legends; account with the you blocks; organization with the directory where the reader
      administers a row, the sync status, the authority block and the delete, and the
      disconnect; workspaces with the directory and the transfer); the four names in both
      locales and the five retired keys gone, types regenerated with no drift; the rail's row
      still `withSection('workspaces')`; `pnpm check` exit 0.*
- [x] `area.svelte.test.ts` finds each section's blocks by their marks and none of the others,
      the retired addresses opening the right section, the member session's organization section
      without the directory or the account block, and the rail's workspaces row leading to the
      workspaces section.
      *Verified: `area.svelte.test.ts` 24 passed with `workspace-menu.svelte.test.ts` and
      `members.svelte.test.ts` alongside, 66; each section by its marks and the absence of the
      others, the five retired addresses, the member session's organization section with no
      directory and no account block, the rail's row.*
- [x] The area was run against the human's organization from the run's worktree and the human
      looked at the four sections before this ticket is resolved; what they said is under Notes.
      *Verified 2026-09-16 over two looks at the dev build from the run's worktree: after the
      first, "within the sections and tabs organize the elements in logical order", and the
      blocks were ordered (the offer first in account; sync status, the Turso account, the
      directory, then disconnect and delete under one "leaving" heading in organization); then
      "all good", with the sync block's look raised as a sidenote that became requirement 25
      and ticket 26.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; the changeset of ticket 03 is extended
      with one paragraph.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9312 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `228 passed`); the changeset
      carries the sections' paragraph.*

## Relevant areas

`apps/desktop/src/lib/settings/{section.ts,component/area.svelte}`,
`apps/desktop/src/lib/settings/tests/`, `apps/desktop/src/routes/settings/+page.svelte`,
`apps/desktop/src/lib/layout/component/{workspace-menu,sidebar,account-menu}.svelte` and any
other link into the area, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Four
  sections*.**
- **Nothing a section held is lost, and no block changes**; this regroups and renames.
- **Plain words, short lines**; the look is judged on the real organization, and the human is
  at the machine, so ask before driving the application.

## Notes

- *2026-09-16, at integration, two looks.* After the first the blocks were ordered by the rule
  "what the section is about first, then what it holds, then what ends something last": the
  ownership offer first in account; sync status, the Turso account block, the members
  directory, then disconnect and delete under one "leaving" legend in organization; general and
  workspaces confirmed. The members gate moved from the section list to the directory block as
  `administersMembers`; three keys were added because two legends and the directory's name had
  been reading the rail's tab labels. Requirement 24 names the reader's own section "account"
  while 826's requirement 18 reserves the word for Turso; the guard test does not reach
  `settings.section`, and the spec's word was built. The second look: "all good", and the sync
  block raised as a sidenote (ticket 26).
