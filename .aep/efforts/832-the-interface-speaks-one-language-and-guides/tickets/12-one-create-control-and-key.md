---
status: resolved
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

- [x] The list shell's create control and the settings directories' create control are one
      component, in one position. The dashboard's text "renew" becomes the contract act's control. Verified: `design/block/create-control.svelte` stands last in 14's `list-toolbar` for the list shell and both settings directories (markers `data-set-bar`/`-end` in the toolbar); the dashboard's renew is `RecordActionControl` from the `contract.renew` act; `create-control.svelte.test.ts`, members and workspaces tests pass on the merged tree.
- [x] `create` is an application shortcut on Mod+N in the registry, answered by the set on screen
      and unavailable, with its reason, where no set is. Verified: `design/create-key.ts` and `layout/component/create-shortcut.svelte` register Mod+N; the last control drawn answers, and with no set the key is refused with `nothingToCreateHere`; `design/tests/create-key.test.ts` passes.
- [x] The palette's create group covers the five concepts. A unit asks for its complex and a
      payment for its contract through the palette's asking mode. `?create` is consumed by the
      host, not by each directory. Verified: `layout/create.ts` declares five palette entries (unit asks for its complex, payment for its contract); `?create` is read by the tenant, complex and contract hosts through `create-intent.svelte.ts`; `layout/tests/create.test.ts` passes.
- [x] Component tests for the control's position and the key's registration. A node test that the
      create group covers five concepts. Verified: component tests for position and key, node test for five concepts; desktop node 1110 of 1110 and vitest all passing on the merged tree after steadying the tenant focus test, which raced the dialog's opening focus once 12 landed.
- [x] `[[rules/interface]]` gains a *Create* section.
 Verified: `rules/interface.md` gains *Create*; validate.mjs no failures.
## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:733-752`, `packages/design/src/lib/create-intent.ts`,
  `layout/component/palette.svelte:43-47`, `organization/component/members.svelte:597-615`,
  `workspaces.svelte:280-300`, `dashboard/component/section.svelte:116-125`

## Notes

WebView2 lets the page answer Ctrl+N
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-create-key]]).
