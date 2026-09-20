---
status: resolved
blocked-by: ['15']
---

# feat(settings): the workspaces section is a directory of workspaces

## Outcome

The workspaces section is a directory of record cards, one per workspace, on the shape the
members section takes: the name, whether it is the open one, this reader's access and how many
hold it; rename, members and delete on the card's menu by their gates; new workspace in a
tray above the cards, as the contracts view has it, for the owner holding the authority, the
refusal in its place for one who lost it; export
and import beneath under the legend naming the open workspace.

## Acceptance Criteria

Traces requirement 21 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 21
and 12.

- [x] `organization/component/workspaces.svelte` draws one record card per workspace with the
      four facts, the card's `href` opening the workspace's edit surface in the section, the
      three acts on the card's menu in plain words by today's gates, the tray above the cards
      carrying `new workspace` for `canCreate` or the `refusal` sentence, the shape the members
      directory and the contracts view take, and the transfer beneath unchanged; the hover
      cluster and the `action` snippet go.
      *Verified 2026-09-16 on the effort branch: `workspaces.svelte` draws `RecordCard`s under
      `DirectoryTray` with the create control or the refusal as the tray's action; `grep` for
      `opacity-0` and the `action` snippet prints nothing; the card carries the name with one
      quiet mark on the open one (the filled disc the status cell uses, `open` as tooltip and
      screen-reader text) and the member count, nothing about access after the human's first
      look; the transfer beneath is untouched; `settings/section.ts` gained `WORKSPACE_PARAM`
      and `recordOf(url, param)`.*
- [x] `workspaces.svelte.test.ts` finds one card per workspace with its facts, the create
      control or the refusal in the tray, each act by its gate, and the transfer legend under
      the list naming the open workspace.
      *Verified: `vitest run src/lib/organization/tests/workspaces.svelte.test.ts`: `Tests 18
      passed (18)`, covering one card per workspace, the tray's legend and sentence, the
      create control in the tray and the refusal in its place, each act by its gate, the
      card's address opening its edit, exactly one open mark carrying its word and no access
      text, the transfer legend after the last card, and Arabic.*
- [x] The section was checked against the human's organization the way ticket 15's was, and
      what they said is under Notes.
      *Verified 2026-09-16 over two looks at the dev build from the run's worktree: after the
      first, "the workspace card record feels odd to carry 'full access' and 'open' in the way
      they are shown ... try showing it in a different elegant way", fixed as the quiet mark
      and no access line; a stale Vite module cache after the rebase made the settings page
      answer 500 until the dev server was restarted; then "Looks right, resolve 16".*
- [x] Every string in both locales; `pnpm check`, `pnpm lint` and `pnpm test` pass; the
      changeset of ticket 03 is extended.
      *Verified in the run's worktree: one new key in both locales, Arabic written, no types
      drift; `pnpm check` exit 0 (desktop `9305 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit
      0, `pnpm test` exit 0 (desktop `198 passed`); the changeset carries the workspaces
      line.*

## Relevant areas

`apps/desktop/src/lib/organization/component/workspaces.svelte`,
`apps/desktop/src/lib/organization/tests/workspaces.svelte.test.ts`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The
  directories*.** The shape is ticket 15's; a need it does not meet is raised, not patched.
- **[[rules/interface]], *Row activation***: a card opens its record and nothing else.

## Notes

- *2026-09-16, the human's first look* (the dev build from the run's worktree): "the workspace
  card record feels odd to carry 'full access' and 'open' in the way they are shown maybe they
  don't need to be there since in the top left of the app shell already shows which one is
  open; maybe 'open' is enough; or maybe they should be shown in a different way; try showing
  it in a different elegant way". Fixed on the branch before the second look: the access line
  left the card and the open workspace carries one quiet mark; requirement 21 corrected.

- *2026-09-16, at integration.* The tray needed no new prop; the create control and the
  refusal ride as its action snippet. A card opens the members-and-access surface where the
  reader holds `grantWorkspace` and the rename only where that is all they hold, since the
  rename belongs to the open workspace alone. The member count keeps `layout.workspaceMenu.members`
  with its `(s)` habit, raised by ticket 15 and not taken here either. The menu's words draw
  the keys that already hold them, under the one-term-one-key invariant.
- The second look followed a 500 on the settings page that was not the code: Vite's hot cache
  held the settings section module from before the rebase that folded the fix in, without
  `WORKSPACE_PARAM`; a dev server restart cleared it. A rebase under a running dev server is
  where this recurs.
