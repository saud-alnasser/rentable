---
status: obsolete
blocked-by: ['07']
---

# feat(settings): the workspaces section says what it is for and every act is visible

## Outcome

The workspaces section opens with a sentence saying what it is for, with new workspace beside
it for the owner holding the authority and the authority refusal standing in its place for an
owner who lost it; every row carries the same visible control the members rows carry, opening
rename, members and delete; the transfer stays beneath under the open workspace's name.

## Acceptance Criteria

Traces requirement 7 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 7
and 12.

- [ ] `organization/component/workspaces.svelte` draws above the list one row: the legend and
      a `Field.Description` sentence on the start side, and on the end side the create button
      for `canCreate` or the `refusal` sentence where there is one; the `action` snippet and
      the hover cluster go; each row ends in one `row-actions` control whose groups are rename
      on the open row for a holder of `renameWorkspace`; members for a holder of
      `grantWorkspace`; delete for the owner. The row's two lines and the transfer beneath are
      unchanged.
- [ ] `workspaces.svelte.test.ts` finds the sentence, the create control before the first row
      for an owner holding the authority and the refusal for one who does not, opens each
      row's control and finds every act by the same gates the test asserts today, and finds
      the transfer legend under the list naming the open workspace.
- [ ] The section was checked against the human's organization the way ticket 07's was.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended.

## Relevant areas

`apps/desktop/src/lib/organization/component/workspaces.svelte`,
`apps/desktop/src/lib/organization/tests/workspaces.svelte.test.ts`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Members
  and workspaces rows carry one visible control*.** The block is ticket 07's and is not
  changed here; a need it does not meet is raised, not patched around.
- **[[rules/interface]], *Row activation***: the row opens nothing.

## Notes

- *Obsolete 2026-09-16.* Superseded by requirement 21 and ticket 16: the section is a directory of record cards, on the shape ticket 15 builds.
