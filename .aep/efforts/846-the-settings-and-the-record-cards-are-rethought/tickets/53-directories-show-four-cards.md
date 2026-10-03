---
status: open
blocked-by: []
---

# feat(desktop): the members and roles directories show four cards and scroll

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "in settings members and roles each one should havea 4x4 cards as masx then more will result in a scorlling area for that directory of records", then "what i mean by 4x4 i meant 4 cards on a 2 columns grid". In the settings page's members and roles sections, each directory lays its cards in a two-column grid (one column only where the settings column is too narrow for two at the card's minimum width) and shows four cards at most, two rows; more cards scroll inside the directory's own bounded area, not the settings page. The height is computed from the fixed card height and the grid gap (exactly two rows, no half-cut card unless that is the deliberate cue that more is below; prefer a quiet fade or the scroll area's own affordance). The tray (search, sort, plus) stays above the scroll area, outside it. The scroll area is the design package's scroll primitive or the directory's existing virtualised scroller bounded by height, keyboard reachable, honouring reduced motion and RTL. Fewer than four cards shows no empty scroll space: the area is as tall as its cards. The workspace page's members (ticket 51) and the workspaces section follow the same cap if they share the component; say in the commit which surfaces carry it.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 16 and 19.

- [ ] A test: the members directory lays its cards in two columns; with more than four members the grid sits in a bounded scroll area whose height is two rows of the fixed card height plus the gap, and the tray is outside it; with few members the area is no taller than its cards.
- [ ] The same for the roles directory.
- [ ] Keyboard focus moving to a card below the fold scrolls it into view; the area is named for screen readers; RTL and reduced motion hold.
- [ ] Desktop check, node and vitest; design tests; eslint and prettier on changed files; [[rules/interface]] and [[contexts/desktop/components]] say it; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/organization/member/component/`, `apps/desktop/src/lib/organization/role/component/`, the shared directory or grid component they use, `packages/design` (scroll area)

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
