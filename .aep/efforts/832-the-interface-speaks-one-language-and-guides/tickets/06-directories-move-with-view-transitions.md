---
status: open
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

- [ ] `design/block/list.svelte` draws from a displayed copy of `data` and commits a changed copy
      inside `document.startViewTransition` when available. Each record cell carries
      `view-transition-name` from a sanitised id. The root snapshot does not animate, and groups
      use the motion tokens.
- [ ] Only a change the list did not cause by its own search transitions: a component test commits
      a search-driven change without calling `startViewTransition`, and a mutation-driven one
      calling it (stubbed).
- [ ] The animated snapshots are clipped to the list's container during the transition.
- [ ] Checked by hand on `/contracts` against the seeded workspace, on a duplicated contract:
      create, delete, Ctrl+Z, re-sort, and a click straight after a delete lands on the row it
      aimed at.

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
