---
status: open
blocked-by: ['15']
---

# feat(settings): the workspaces section is a directory of workspaces

## Outcome

The workspaces section is a directory of record cards, one per workspace, on the shape the
members section takes: the name, whether it is the open one, this reader's access and how many
hold it; rename, members and delete on the card's menu by their gates; new workspace at the
foot for the owner holding the authority, the refusal in its place for one who lost it; export
and import beneath under the legend naming the open workspace.

## Acceptance Criteria

Traces requirement 21 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 21
and 12.

- [ ] `organization/component/workspaces.svelte` draws one record card per workspace with the
      four facts, the card's `href` opening the workspace's edit surface in the section, the
      three acts on the card's menu by today's gates, the foot carrying `new workspace` for
      `canCreate` or the `refusal` sentence, and the transfer beneath unchanged; the hover
      cluster and the `action` snippet go.
- [ ] `workspaces.svelte.test.ts` finds one card per workspace with its facts, the create
      control or the refusal at the foot, each act by its gate, and the transfer legend under
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
