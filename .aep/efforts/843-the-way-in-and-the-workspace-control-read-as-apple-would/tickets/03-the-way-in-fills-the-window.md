---
status: open
blocked-by: [02]
---

# feat(desktop): the way in fills the window

## Outcome

While nobody is signed in, the window draws the titlebar and its window controls around the way in.
It draws no rail, workspace control, breadcrumb, search or shortcut button. The frame's `signed-out`
state is replaced by `way-in`, and the chrome decision moves to a plain module that a `node:test`
drives. The components that only the signed-out rail drew are deleted.

## Acceptance Criteria

Traces requirement 7 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and the half of its criterion 7 about what is drawn.

- [ ] `shell/component/frame.svelte` takes `shell: 'bare' | 'way-in' | 'full'`. `way-in` draws the
      titlebar with the window controls and nothing else from the chrome.
- [ ] The chrome table moves out of `startup/component/root.svelte` into `startup/screen.ts` (or a
      sibling plain module). A `node:test` asserts:
      - `sign-in`, `no-workspace`, and loading with nobody in yield `way-in`;
      - loading after a switch yields `full`;
      - failures yield `bare`.
- [ ] `/settings` opened signed out draws on the `way-in` frame, with the back control returning to
      the way in.
- [ ] `shell/component/sidebar.svelte` has no `signedOut` prop.
- [ ] `workspace/component/locked.svelte` and
      `organization/session/component/account-signed-out.svelte` are deleted, with their strings in
      both locales.
- [ ] The frame's comment says the decision changed, when, and why (the human, 2026-09-30).

## Relevant areas

- `apps/desktop/src/lib/shell/component/{frame,sidebar,window}.svelte`
- `apps/desktop/src/lib/startup/component/root.svelte`, `startup/screen.ts`, `startup/tests/`
- `apps/desktop/src/lib/organization/surface.ts` (the account-menu slot), `workspace/surface.ts`

## Constraints

- The rail latch (`railIsUp`) keeps its meaning for a switch.
- This is a user-visible change: add the effort's changeset here. Later tickets amend it.
