---
status: open
blocked-by: [10]
---

# feat(desktop): one create control, one create key

## Outcome

Every set a person can add to has one create control, in the same position. Ctrl/Cmd+N creates in
the set on screen. The command menu creates tenants, complexes, units, contracts and payments. Every
route to create calls the concept host's `create`.

## Acceptance Criteria

Traces requirements 6 and 9 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 9.

- [ ] The list shell's create control and the settings directories' create control are one
      component, in one position. The dashboard's text "renew" becomes the contract act's control.
- [ ] `create` is an application shortcut on Mod+N in the registry, answered by the set on screen
      and unavailable, with its reason, where no set is.
- [ ] The palette's create group covers the five concepts. A unit asks for its complex and a
      payment for its contract through the palette's asking mode. `?create` is consumed by the
      host, not by each directory.
- [ ] Component tests for the control's position and the key's registration. A node test that the
      create group covers five concepts.
- [ ] `[[rules/interface]]` gains a *Create* section.

## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:733-752`, `packages/design/src/lib/create-intent.ts`,
  `layout/component/palette.svelte:43-47`, `organization/component/members.svelte:597-615`,
  `workspaces.svelte:280-300`, `dashboard/component/section.svelte:116-125`

## Notes

WebView2 lets the page answer Ctrl+N
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-create-key]]).
