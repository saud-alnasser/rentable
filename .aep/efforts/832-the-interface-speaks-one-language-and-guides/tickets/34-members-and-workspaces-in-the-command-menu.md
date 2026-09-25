---
status: resolved
---

# feat(organization): the command menu reaches member and workspace acts

## Outcome

A member's and a workspace's acts are offered in the command menu through its asking mode, as
every other concept's are, with the same gates the settings directories apply. Found by converge
round 1: the acts are declared and projected (ticket 11), but the command menu never lists them.

## Acceptance Criteria

Traces requirements 7 and 8 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 8.

- [x] `layout/record-search.ts` lists member and workspace, each asking for its record and running
      the act through the organization host (a `runOn(actId, id)` or equivalent), with the reader's
      gates read where the directory reads them. Verified: `useRecordConcepts` adds member and workspace; the reader's gates are built once (`memberReaderOf`, `toMemberActContext`, `workspaceContextOf` in `organization/acts.ts`) and used by settings, members and the palette; `runOn` rechecks through `toPaletteVerbs` and runs the organization host; `pnpm check` 0 errors on the merged tree.
- [x] A test opens the command menu, asks for a member act and a workspace act, and asserts each
      reaches the organization host with the record; an act the reader may not take is not offered
      or is shown refused with its reason. Verified: `layout/tests/palette-organization.svelte.test.ts` (5 pass): a member act and a workspace act reach the host with the record and context, acts the reader may not take are not offered, a record with a running write is refused with its reason; desktop vitest 369 of 369 on the merged tree.
- [x] `[[rules/interface]]` no longer states anything the command menu does not do.
 Verified: `rules/interface.md` says how the menu gates member and workspace acts and that they are found through an act.
## Relevant areas

- `apps/desktop/src/lib/layout/record-search.ts`, `layout/component/palette.svelte`,
  `organization/acts.ts`, `organization/host.svelte.ts`, `organization/component/host.svelte`

## Constraints

- Owner-only and permission-gated acts keep exactly today's gates.
