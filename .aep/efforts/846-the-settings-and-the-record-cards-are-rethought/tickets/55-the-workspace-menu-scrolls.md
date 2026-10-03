---
status: open
blocked-by: []
---

# feat(desktop): the workspace menu scrolls past a few workspaces

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "als the drop down of worksspaces maybe at a limit becomes scrollable". The sidebar's workspace menu (`apps/desktop/src/lib/workspace/component/menu.svelte`) lists every workspace the member holds as radio rows; with a dozen it runs long. The list of workspaces is capped at a height of about seven rows (a part-shown eighth row is the cue that more is below, as macOS menus do) and scrolls within itself past that; the label above and the *manage workspaces* row below stay in view outside the scroll. When the menu opens with the open workspace below the fold it is scrolled into view; arrow keys moving to a row out of view scroll it in (the menu primitive's roving focus does this if the scroll container is the right element; check). Fewer workspaces than the cap: no scroll and no extra space. RTL and reduced motion hold; the scrollbar is the quiet one the app uses elsewhere.

**Revised 2026-10-03** by the human: "in the workspace dropdwn scroollable area after 5 workspaces and only the upper section the choosing chosises part where the ma ager owksapces is not part of the scroable area; also the "mamnanger workspaces.." needs to be better worded". The cap is five workspace rows, not seven; only the radio list scrolls, the manage row outside it. The manage row is reworded *workspace settings* (Arabic *إعدادات مساحات العمل*) without the ellipsis: it opens the settings workspaces section, a place rather than a command that asks for more (Apple's HIG keeps the ellipsis for those). Where this paragraph and the one above disagree, this one holds.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03.

- [ ] A test: with more workspaces than the cap, the radio group sits in a scroll container whose max height is the cap, and the manage row is outside it; with few, no cap applies.
- [ ] A test: opening with the open workspace past the cap scrolls it into view (or asserts `scrollIntoView` is asked for it); arrow keys keep the focused row in view.
- [ ] A test: the manage row reads workspace settings in English and its Arabic, with no ellipsis.
- [ ] Desktop check, node and vitest; eslint and prettier on changed files; [[rules/interface]] says it; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/workspace/component/menu.svelte`, its tests, `packages/design` dropdown menu and scroll area primitives

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
