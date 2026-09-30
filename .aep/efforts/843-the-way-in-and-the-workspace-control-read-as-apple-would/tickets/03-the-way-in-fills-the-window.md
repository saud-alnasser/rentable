---
status: resolved
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

- [x] `shell/component/frame.svelte` takes `shell: 'bare' | 'way-in' | 'full'`. `way-in` draws the
      titlebar with the window controls and nothing else from the chrome. *Verified: the frame's
      `hasRail` is `shell === 'full'`, so the trigger, breadcrumb, search and shortcut button are drawn
      only there; `shell/tests/frame.svelte.test.ts` renders `bare`, `way-in` and `full` and passes;
      `pnpm check` printed 0 errors.*
- [x] The chrome table moves out of `startup/component/root.svelte` into `startup/screen.ts` (or a
      sibling plain module). A `node:test` asserts:
      - `sign-in`, `no-workspace`, and loading with nobody in yield `way-in`;
      - loading after a switch yields `full`;
      - failures yield `bare`.

      *Verified: `shellFor` in `startup/screen.ts`; `node --import tsx --test
      startup/tests/screen.test.ts` printed 24 pass, 0 fail, including "the way in is drawn on the
      titlebar alone", "the rail is drawn once a person is in, and a switch keeps it", "a startup that
      stopped draws the bare frame" and "no state with nobody in draws the rail".*
- [x] `/settings` opened signed out draws on the `way-in` frame, with the back control returning to
      the way in. *Verified: `/settings` signed out is `sign-in` with the route drawn, so
      `shellFor` gives `way-in`; `npx vitest run src/routes/settings` printed 2 passed: signed out the
      route draws `[data-back-control]` at `start-4 top-4` with the way in as its fallback, signed in
      none.*
- [x] `shell/component/sidebar.svelte` has no `signedOut` prop. *Verified: `grep -n signedOut
      shell/component/sidebar.svelte` prints nothing; the slot props lost it, and `onWayIn` with it.*
- [x] `workspace/component/locked.svelte` and
      `organization/session/component/account-signed-out.svelte` are deleted, with their strings in
      both locales. *Verified: both files are deleted; `layout.accountMenu` (its two keys) and
      `layout.workspaceMenu.locked` are gone from both locales and listed in
      `i18n/tests/organization.test.ts`'s retired keys, which passes.*
- [x] The frame's comment says the decision changed, when, and why (the human, 2026-09-30).
      *Verified: the frame's header reads "Changed 2026-09-30 by the human (effort 843, requirement
      7)" with what it said before and why it moved; the sidebar's says the same.*

## Relevant areas

- `apps/desktop/src/lib/shell/component/{frame,sidebar,window}.svelte`
- `apps/desktop/src/lib/startup/component/root.svelte`, `startup/screen.ts`, `startup/tests/`
- `apps/desktop/src/lib/organization/surface.ts` (the account-menu slot), `workspace/surface.ts`

## Constraints

- The rail latch (`railIsUp`) keeps its meaning for a switch.
- This is a user-visible change: add the effort's changeset here. Later tickets amend it.

*Built 2026-10-01: `wayInFrom`, which only the signed-out account row called, went with it. The
effort's changeset is `.changeset/the-way-in-has-the-window-to-itself.md`; tickets 09 and 10 had
already added their own.*
