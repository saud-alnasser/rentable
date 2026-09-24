---
status: open
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

- [ ] `organization/acts.ts` declares the member acts (as `members.svelte:445` lists them today) and
      the workspace acts (as `workspaces.svelte:230` lists them), with `appliesTo` and `unavailable`
      carrying today's conditions.
- [ ] The callbacks `routes/settings/+page.svelte:403` passes in are replaced by the host's `run`.
- [ ] The node projection test covers member and workspace.
- [ ] The accepted deviation in `[[rules/interface]]` *Row activation* (a settings card opens its
      sheet) still holds.

## Relevant areas

- `apps/desktop/src/lib/organization/component/members.svelte`, `workspaces.svelte`,
  `organization/dialogs.svelte.ts`, `routes/settings/+page.svelte`

## Constraints

- Owner-only and permission-gated acts keep exactly today's gates. This ticket moves declarations,
  not permissions.
