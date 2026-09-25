---
status: resolved
blocked-by: [09]
---

# refactor(organization): member and workspace acts are declared once

## Outcome

The members and workspaces directories in settings declare their acts in `organization/acts.ts`
and project them onto card, context menu and command menu like every domain concept. The wording
settles on one verb per act: edit, not rename and edit side by side. The edit glyph is the same as
everywhere else.

## Acceptance Criteria

Traces requirements 6 and 8 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 8.

- [x] `organization/acts.ts` declares the member acts (as `members.svelte:445` lists them today) and
      the workspace acts (as `workspaces.svelte:230` lists them), with `appliesTo` and `unavailable`
      carrying today's conditions. Verified: `organization/acts.ts` declares 8 member and 3 workspace acts carrying today's gates; the existing members and workspaces component tests pass unchanged apart from rename to edit (desktop vitest 258 of 258 on the merged tree).
- [x] The callbacks `routes/settings/+page.svelte:403` passes in are replaced by the host's `run`. Verified: a grep for the old act callbacks in `routes/settings/+page.svelte` and `settings/component/area.svelte` finds none; `organization/component/host.svelte` is mounted in `frame.svelte` beside the other four hosts after integration.
- [x] The node projection test covers member and workspace. Verified: `design/tests/acts.test.ts` holds member and workspace cases under each kind of reader beside ticket 10's; desktop node 1071 of 1071 on the merged tree.
- [x] The accepted deviation in `[[rules/interface]]` *Row activation* (a settings card opens its
      sheet) still holds.
 Verified: the members and workspaces tests 'a card opens its own record' pass; `rules/interface.md` *Row activation* notes it.
## Relevant areas

- `apps/desktop/src/lib/organization/component/members.svelte`, `workspaces.svelte`,
  `organization/dialogs.svelte.ts`, `routes/settings/+page.svelte`

## Constraints

- Owner-only and permission-gated acts keep exactly today's gates. This ticket moves declarations,
  not permissions.
