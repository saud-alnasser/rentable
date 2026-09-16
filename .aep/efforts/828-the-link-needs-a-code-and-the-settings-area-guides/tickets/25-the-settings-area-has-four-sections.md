---
status: open
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

- [ ] `settings/section.ts`: `SettingsSection` is `general | account | organization |
      workspaces`, with a map from each retired name (`you`, `members`, `sync`, `updates`,
      `diagnostics`) to the section that holds it, read by `withSection` and by the area's
      address reading; `DEFAULT_SECTION` stays general; `section.test.ts` asserts the map and
      that a retired name resolves.
- [ ] `settings/component/area.svelte` draws the four: general with the general blocks, then
      updates and diagnostics under their own legends; account with the you blocks; organization
      with the members directory, then the authority block and the delete; workspaces with the
      directory and the transfer beneath; every gate keeps its prop, so a member's organization
      section draws what the sync section drew for a member and no directory; the four names in
      both locales under `settings.section`, the retired names removed, `i18n-types.ts`
      regenerated; the rail's row and every other link into the area names a live section.
- [ ] `area.svelte.test.ts` finds each section's blocks by their marks and none of the others,
      the retired addresses opening the right section, the member session's organization section
      without the directory or the account block, and the rail's workspaces row leading to the
      workspaces section.
- [ ] The area was run against the human's organization from the run's worktree and the human
      looked at the four sections before this ticket is resolved; what they said is under Notes.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; the changeset of ticket 03 is extended
      with one paragraph.

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
