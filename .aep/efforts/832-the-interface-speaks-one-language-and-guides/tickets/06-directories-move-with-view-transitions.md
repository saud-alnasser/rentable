---
status: resolved
blocked-by: [05]
---

# feat(desktop): directories move with view transitions

## Outcome

When a mutation, an undo or a sort changes a directory's result set, the list commits it inside a
same-document view transition. A record created arrives, a record deleted leaves, an undone delete
comes back in place, and a re-sorted record moves, including rows the virtualiser adds or removes.
A search keystroke does not animate. Snapshots stay inside the list's clip. Where
`startViewTransition` is missing, the set is committed directly.

## Acceptance Criteria

Traces requirement 4 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 4(c).

- [x] `design/block/list.svelte` draws from a displayed copy of `data` and commits a changed copy
      inside `document.startViewTransition` when available. Each record cell carries
      `view-transition-name` from a sanitised id. The root snapshot does not animate, and groups
      use the motion tokens. Verified: `list.svelte` draws from a displayed copy and commits gain, loss or reorder inside `startViewTransition` (directly where missing); cells carry `list-<id>-<sanitised id>`; the root is `view-transition-name: none` during the list's transition; groups use `--duration-base` with the move, exit and enter easings; `list-motion.test.ts` with the motion, type and icon lint passes 14 of 14 on the effort branch.
- [x] Only a change the list did not cause by its own search transitions: a component test commits
      a search-driven change without calling `startViewTransition`, and a mutation-driven one
      calling it (stubbed). Verified: `list-motion.svelte.test.ts` passes 4 of 4 on the effort branch: a search commits without calling the stub, a mutation calls it once.
- [x] The animated snapshots are clipped to the list's container during the transition. Verified: the same vitest file asserts `data-list-motion` and an `inset(...)` clip are on the root while the transition runs and removed after; `pnpm check` 0 errors.
- [x] Checked by hand on `/contracts` against the seeded workspace, on a duplicated contract:
      create, delete, Ctrl+Z, re-sort, and a click straight after a delete lands on the row it
      aimed at.
 Verified: the human checked on /contracts in the running app on 2026-09-24. The first look found staying cards flashing and a re-sort crossfading; the fix (one image per staying card, a move on `--ease-move` over `--duration-slow`) was folded into this commit, and the second look reported all good.
## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte` (virtual rows around `:840-890`; keys from
  `packages/design/src/lib/group.ts`)
- [[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/list-motion]] for
  what was built and seen

## Constraints

- The plan's *Architecture 4*. `animate:flip` lost.
- The list query's `placeholderData: previous` stays, so a search change never flashes empty.

## Notes

The dev database syncs to the human's Turso workspace. Test deletes on a duplicate.
