---
status: open
blocked-by: ['01', '05']
---

# feat(organization): invite and new workspace are dialogs

## Outcome

Inviting a member and creating a workspace are two forms on the shared form surface, mounted once
in the shell and opened from the rail's workspace menu and from the organization page alike. The
menu's two rows are live for whoever the row's permission admits and say whose act it is for
everybody else, with no padlock. The organization page holds lists and openers, and no form.

## Acceptance Criteria

Traces requirement 10, requirement 12, requirement 13, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]],
and its criterion 10, criterion 12 and criterion 13.

- [ ] `organization/dialogs.svelte.ts` holds the open state and its two functions;
      `layout/component/organization-dialogs.svelte` mounts the invite `FormSurface` (heavy) and
      the workspace `FormSurface` (light) once, rendered by `routes/+layout.svelte` inside the
      providers while the rail is up and a session is held.
- [ ] `invite-form.svelte.test.ts` renders the dialog open and asserts its fields, and with
      `invited` set the result panel with both copy controls and the cannot-send sentence, until
      dismissed.
- [ ] The workspace dialog renders ticket 01's shared fields; `setup.test.ts`'s pinned over-limit
      message is what its test reads.
- [ ] `workspace-menu.svelte.test.ts`: with `canInvite` true the row calls the invite opener; false,
      it is `aria-disabled` with the refusal sentence; the same for the workspace row on
      `canCreateWorkspace`, with the owner-only sentence for a non-owner and the reconnect
      sentence for an owner without authority. `grep -c LockIcon workspace-menu.svelte` is zero.
- [ ] `grep -c "<form" routes/organization/+page.svelte` is zero; the members, invitations and
      workspaces sections stay and the two that held forms hold openers; the page no longer holds
      `useCreateWorkspace`, `useInviteMember`, `invited`, `copied` or `create`.
- [ ] The invite and create buttons carry their verb glyph; email, name and workspace fields carry
      muted leading glyphs.
- [ ] Checked by hand at 700px that the invite sheet opens over the sidebar's drawer, not under it.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; Arabic written, not copied.

## Relevant areas

`apps/desktop/src/lib/organization/component/{invite-form,workspaces}.svelte`,
`routes/organization/+page.svelte`, `layout/component/{workspace-menu,sidebar}.svelte`,
`routes/+layout.svelte`, `organization/query.ts`. `lib/complex/component/form.svelte` is the
model for a heavy form owning its mutations inside `FormSurface`; `layout/startup-stage.svelte.ts`
for module-level rune state; `sync/sign-out.ts` for a request raised in one place and answered in
another.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The two dialogs mount once, in the shell*, and the third technical risk.**
- **[[rules/interface]], *Form surface*: the weight is declared, not measured.** Invite is heavy;
  new workspace is light.
- **Who may do what is the session's** ([[rules/credentials]]): `inviteMember` for the invite,
  owner with `holdsTursoAuthority` for the workspace, and Rust refuses again regardless. The
  refusal sentences are composed in the sidebar from the locale; the menu draws and never decides.
- **A changeset rides with the change.**
