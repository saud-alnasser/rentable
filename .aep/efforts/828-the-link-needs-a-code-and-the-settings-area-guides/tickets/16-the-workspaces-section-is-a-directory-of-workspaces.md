---
status: open
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

- [ ] `organization/component/workspaces.svelte` draws one record card per workspace with the
      four facts, the card's `href` opening the workspace's edit surface in the section, the
      three acts on the card's menu in plain words by today's gates, the tray above the cards
      carrying `new workspace` for `canCreate` or the `refusal` sentence, the shape the members
      directory and the contracts view take, and the transfer beneath unchanged; the hover
      cluster and the `action` snippet go.
- [ ] `workspaces.svelte.test.ts` finds one card per workspace with its facts, the create
      control or the refusal in the tray, each act by its gate, and the transfer legend under
      the list naming the open workspace.
- [ ] The section was checked against the human's organization the way ticket 15's was, and
      what they said is under Notes.
- [ ] Every string in both locales; `pnpm check`, `pnpm lint` and `pnpm test` pass; the
      changeset of ticket 03 is extended.

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
