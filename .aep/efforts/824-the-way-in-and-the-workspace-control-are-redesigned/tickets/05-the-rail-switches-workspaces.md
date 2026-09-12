---
status: open
---

# feat(layout): the rail switches workspaces

## Outcome

The workspace menu at the top of the rail lists the workspaces the signed-in member holds, marks
the open one, and opening another runs the same path a sign-in runs past the wall, under the
loading surface, with the rail naming the new workspace once it is open and startup reopening it
next launch. The menu's comment stops describing a world with one workspace.

## Acceptance Criteria

Traces requirement 9 and requirement 11 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 9 and criterion 11.

- [x] `startup.switchWorkspace(id)` exists with the shape [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]] gives; `startup.test.ts` holds that
      it clears the cache, calls `openWorkspace` with the id, runs the stages to `ready`, sets
      `error` when the open throws, is a no-op while signing in or loading, and drops a sync
      outcome that arrives for the previous workspace after the switch. *Verified: `node --import
      tsx --test --experimental-test-module-mocks src/lib/layout/tests/startup.test.ts` printed
      `tests 30, pass 30, fail 0`, four of them new; "clears the cache" is asserted as the undrawn
      queries dropped once and `invalidateAll` called once, since a `clear()` would have left the
      rail's observer stale (the plan's paragraph records why); the late outcome carries the
      workspace it ran for and is dropped whole, the snapshot deep-equal before and after.*
- [x] `workspace-menu.svelte.test.ts` (new) renders rows equal to `workspaces`, the marker on
      `openId`, and selecting another row calls `onSwitch` with its id; rerendering with a new
      `openId` keeps one `[data-workspace-menu]`. *Verified: `npx vitest run
      src/lib/layout/tests/workspace-menu.svelte.test.ts` printed `Tests 4 passed (4)`: rows equal
      `workspaces`, `aria-checked` on `openId`, clicking the other row yields its id, and a
      rerender with the other `openId` keeps one `[data-workspace-menu]` with the marker moved.*
- [x] The sidebar passes `session.workspaces`, `workspace.remoteId` as the open id, and
      `onSwitch` calling `startup.switchWorkspace`; the rail's name after a switch comes from the
      same query the marker reads. *Verified by reading `sidebar.svelte`: `workspaces={session.workspaces}`,
      `openId={workspace.remoteId}`, `onSwitch={(id) => startup.switchWorkspace(id)}`, with
      `workspace` and `openId` both off the remote-sync query; `pnpm check` in `apps/desktop`
      printed `0 ERRORS`.*
- [ ] Verified once by hand between the human's two workspaces: the loading surface, the new name
      in the rail, and `remote-sync.json` recording the new id; recorded under Notes.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the stack's tip on 2026-09-12:
      `pnpm check` in `apps/desktop` printed `9268 FILES 0 ERRORS 0 WARNINGS` and in
      `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx prettier --check .` printed `All
      matched files use Prettier code style!`, `npx eslint .` exited 0, `npx turbo run test --force`
      printed `Tasks: 4 successful, 4 total` (desktop node:test 899 pass, vitest 57 passed). The
      root `pnpm check` wrapper cannot start in this worktree (pnpm 12.4.1 task-state path over
      Windows' limit with long paths off), so its pieces were run one by one.*

## Relevant areas

`apps/desktop/src/lib/layout/startup.ts` (`#enterApplication`, `standingChanged`,
`applySyncOutcome`), `layout/startup-ports.ts`, `layout/component/{workspace-menu,sidebar}.svelte`,
`layout/tests/startup.test.ts` and `layout/tests/testing.ts` for the port fakes.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *A switch runs the sign-in path*, and the first technical risk.** Rust is untouched.
- **The invite and new-workspace rows are not this ticket's**: leave them as they are, padlock and
  all, for ticket 06, which lands on this file after it. Do not remove `LockIcon` here.
- **The list's look is settled on screen** against the human's two workspaces; ask before driving
  the app. The menu's ClickUp shape (workspace at the top, actions under it, the way to make
  another at the foot) is the human's from 2026-08-20 and the list goes inside it.
- **A changeset rides with the change.**
