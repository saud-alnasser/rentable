---

---

# Hypothesis

Same-document view transitions (A) animate a directory's records arriving, leaving and moving
better than Svelte's `animate:flip` with `in`/`out` (B), because A reaches rows the virtualiser adds
and removes and B moves only rows already on screen.

# Falsifier

The human prefers B or no motion, or A's suspended hit-testing makes a click straight after a
delete land wrongly.

# Experiment

On 2026-09-24, `apps/desktop/src/lib/design/block/list.svelte` in the prototype worktree took a
`motion` variant:

- `none`: current behaviour; a refetch replaces the rows at once.
- `view-transition` (A): the list draws from a copy of `data`, and a changed array is committed
  inside `document.startViewTransition(async () => { displayed = next; await tick(); })` where
  supported. Each record cell carries `view-transition-name: rec-<id>` (sanitised). CSS: the root
  snapshot does not animate; groups and old and new images run 200 ms, groups on
  `cubic-bezier(0.2, 0, 0, 1)`, images `ease-out`; all off under `prefers-reduced-motion`.
- `flip` (B): the row wrapper became the keyed each's only child (`{#if row}` moved inside it),
  with `animate:flip` at 200 ms and a 150 ms fade in and out, off under `prefersReducedMotion`.

Judged by the human on `/contracts` in WebView2 (Windows) against the seeded workspace.

Known before judging: under A, a search keystroke also transitions, and the animated snapshots draw
above the page, so the list's rounded clip does not hold during the 200 ms. Under B, rows the
virtualiser brings into view while scrolling also fade.

# Observation

The human chose view transitions.

# Result

Confirmed.

# Conclusion

**A wins.** The plan's *Architecture 4* is settled for view transitions, feature-detected, with no
animation where `startViewTransition` is missing. B is lost: it moves only visible rows and fades
rows during ordinary scrolling. Carried into the ticket: a search keystroke must not transition
(only a data change caused by a mutation, an undo or a sort should), and the snapshots must stay
inside the list's clip.

# Disposition of the code

Deleted with the worktree. The mechanism is rewritten in the list block under `/implement`.
