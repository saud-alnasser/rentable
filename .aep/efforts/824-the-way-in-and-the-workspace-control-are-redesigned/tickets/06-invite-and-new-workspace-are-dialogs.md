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

- [x] `organization/dialogs.svelte.ts` holds the open state and its two functions;
      `layout/component/organization-dialogs.svelte` mounts the invite `FormSurface` (heavy) and
      the workspace `FormSurface` (light) once, rendered by `routes/+layout.svelte` inside the
      providers while the rail is up and a session is held.
      *Verified: `organization/dialogs.svelte.ts` exports `organizationDialog` (rune state with
      `open` and, beyond the plan, `invited`, since the members list's reissue also produces a link
      and password that needed the one panel once the inline form left the page),
      `openOrganizationDialog`, `closeOrganizationDialog`, `showInvited`, `dismissInvited`,
      `resetOrganizationDialogs`; `layout/component/organization-dialogs.svelte` mounts the heavy
      invite surface and the light workspace surface once and owns both mutations from context;
      `grep -n 'railIsUp && shellState.organization?.session' -A1
      apps/desktop/src/routes/+layout.svelte` printed the guard rendering
      `<LayoutOrganizationDialogs />` inside the providers.*
- [x] `invite-form.svelte.test.ts` renders the dialog open and asserts its fields, and with
      `invited` set the result panel with both copy controls and the cannot-send sentence, until
      dismissed.
      *Verified: `npx vitest run src/lib/organization/tests/invite-form.svelte.test.ts` in
      `apps/desktop` printed `Tests 10 passed (10)`: the open surface, the fields, and with
      `invited` set the panel with both copy controls and the cannot-send sentence until the done
      control calls `onDismiss`.*
- [x] The workspace dialog renders ticket 01's shared fields; `setup.test.ts`'s pinned over-limit
      message is what its test reads.
      *Verified: `npx vitest run src/lib/organization/tests/workspace-dialog.svelte.test.ts` printed
      `Tests 6 passed (6)`; after an over-limit input and focusout the `role=alert` text equals
      `en.workspace.nameTooLong` and `ar.workspace.nameTooLong`, the string `setup.test.ts` pins.*
- [x] `workspace-menu.svelte.test.ts`: with `canInvite` true the row calls the invite opener; false,
      it is `aria-disabled` with the refusal sentence; the same for the workspace row on
      `canCreateWorkspace`, with the owner-only sentence for a non-owner and the reconnect
      sentence for an owner without authority. `grep -c LockIcon workspace-menu.svelte` is zero.
      *Verified: `npx vitest run src/lib/layout/tests/workspace-menu.svelte.test.ts` printed `Tests
      9 passed (9)`: the invite row calls the opener when admitted and is `aria-disabled="true"`
      with the refusal sentence (linked by `aria-describedby`) when not; the create row likewise,
      with the owner-only sentence for a non-owner and the reconnect sentence for an owner without
      authority; `grep -c LockIcon apps/desktop/src/lib/layout/component/workspace-menu.svelte`
      printed `0`.*
- [x] `grep -c "<form" routes/organization/+page.svelte` is zero; the members, invitations and
      workspaces sections stay and the two that held forms hold openers; the page no longer holds
      `useCreateWorkspace`, `useInviteMember`, `invited`, `copied` or `create`.
      *Verified: `grep -c "<form" apps/desktop/src/routes/organization/+page.svelte` printed `0`; a
      grep for `useCreateWorkspace|useInviteMember|invited|copied|create` hits only the docstring;
      the six `Field.Legend` sections remain, the invite and workspaces sections holding openers.*
- [x] The invite and create buttons carry their verb glyph; email, name and workspace fields carry
      muted leading glyphs.
      *Verified: the three runs above assert `svg` inside the invite and create submit buttons and
      `[data-slot=input-group-addon] svg` before the email, name and workspace inputs with the addon
      carrying `text-muted-foreground`.*
- [ ] Checked by hand at 700px that the invite sheet opens over the sidebar's drawer, not under it.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; Arabic written, not copied.
      *Verified: on the stack's tip on 2026-09-12: `pnpm check` in `apps/desktop` printed `9277
      FILES 0 ERRORS 0 WARNINGS` and in `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx
      prettier --check .` printed `All matched files use Prettier code style!`, `npx eslint .`
      exited 0, `npx turbo run test --force` printed `Tasks: 4 successful, 4 total` (desktop
      node:test 901 pass, vitest 78 passed). The five new Arabic strings were written against their
      neighbours. The root `pnpm check` wrapper cannot start in this worktree (pnpm 12.4.1
      task-state path over Windows' limit), so its pieces were run one by one.*

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

## Notes

Landed 2026-09-12 with the 700px box open for the human at the machine. bits-ui writes `aria-disabled="false"` from its own `disabled` prop over an attribute set on `DropdownMenu.Item`, so ticket 05's inert rows never carried `aria-disabled="true"` in the DOM; the refused rows here are drawn through the primitive's `child` snippet, which carries it and keeps keyboard order. Raised, not taken: `layout.noWorkspace.ownerOnly` now reads under a populated workspaces list and its wording is ticket 07's; a pre-existing superforms duplicate-form-id warning in `setup-walk.svelte.test.ts`.

**Review, 2026-09-13.** Three findings landed here. The invalidation of the organization state
after a create moved from the host into `useCreateWorkspace`'s own `onSuccess`, where every other
invalidating mutation in `organization/query.ts` does it; the root layout's caller hands the
client in and the host reads it from context, and the hook takes either. The page's create opener
is gated as the rail's row is, owner and `holdsTursoAuthority`, rather than owner alone, so a
restored owner without the authority is not offered a create the shell refuses. And the host keys
both surfaces on the locale, since each builds its validation messages when it is built and the
host is built once per session.
