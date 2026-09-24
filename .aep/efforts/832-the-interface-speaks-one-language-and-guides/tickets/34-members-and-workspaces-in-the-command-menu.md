---
status: open
---

# feat(organization): the command menu reaches member and workspace acts

## Outcome

A member's and a workspace's acts are offered in the command menu through its asking mode, as
every other concept's are, with the same gates the settings directories apply. Found by converge
round 1: the acts are declared and projected (ticket 11), but the command menu never lists them.

## Acceptance Criteria

Traces requirements 7 and 8 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 8.

- [ ] `layout/record-search.ts` lists member and workspace, each asking for its record and running
      the act through the organization host (a `runOn(actId, id)` or equivalent), with the reader's
      gates read where the directory reads them.
- [ ] A test opens the command menu, asks for a member act and a workspace act, and asserts each
      reaches the organization host with the record; an act the reader may not take is not offered
      or is shown refused with its reason.
- [ ] `[[rules/interface]]` no longer states anything the command menu does not do.

## Relevant areas

- `apps/desktop/src/lib/layout/record-search.ts`, `layout/component/palette.svelte`,
  `organization/acts.ts`, `organization/host.svelte.ts`, `organization/component/host.svelte`

## Constraints

- Owner-only and permission-gated acts keep exactly today's gates.
