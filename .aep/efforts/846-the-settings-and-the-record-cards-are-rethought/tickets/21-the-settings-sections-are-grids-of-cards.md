---
status: open
blocked-by: [06, 09, 10, 13, 22]
---

# feat(desktop): a settings section is a grid of cards, and its detail folds

Blocked by: 06, 09, 10, 13, 22

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Every settings section draws its groups as cards in a grid rather than one linear column, as the plan's *The section is a grid of group cards* gives it: `settings-grid.svelte`, `settings-group.svelte`'s `span` and its title and footer inside the card, and each of the four sections on the grid with the spanning groups the plan names; and `settings-row.svelte`'s `details`, an expander on the `collapsible` primitive, used for exactly the rows the plan's *Detail that few readers need folds under its row* names. Added mid-run at the human's word of 2026-10-02, and widened the same day by their words "the tabs remain the same but each section ... everything is a card": every tab's content is the cards the plan's *Everything in a tab is a card* names, components chosen by the context ticket 22 writes.

## Acceptance Criteria

Traces requirement 1 and criterion 1 as revised on 2026-10-02.

- [ ] A component test in `packages/design/src/lib/block/tests/` renders a grid of three groups, one spanning, and finds the spanning group marked to span both columns, the others not, and every group's title and footer inside its card.
- [ ] `app/tests/settings-area.svelte.test.ts` finds each section's groups inside one `settings-grid`, the groups the plan names marked as spanning, and the ending groups last in source order.
- [ ] Every card has its header inside it (title and line), rows with their meta line under the name, and its ending acts after a separator in the error tone on the act alone; the directories are not boxed.
- [ ] Screenshots of the running app on real data, all four sections, English and Arabic, light and dark, at a width giving two columns and one giving one, are attached under `evidence/prototypes/` and the look is judged against [[rules/interface]]'s *The visual reference*.
- [ ] A component test finds a row with `details` closed by default with its value and control visible, the chevron's `aria-expanded` and `aria-controls` tied to the detail, opened by Enter and Space, and no animation under reduced motion; a row in a group's `end` takes no `details`.
- [ ] The area test finds the four folded rows the plan names, and finds the sync state word, a problem callout, the machines list and every `end` act outside any collapsed region.
- [ ] [[rules/interface]] says a settings section is a grid of group cards, and when detail folds under a row.

## Relevant areas

- `packages/design/src/lib/block/{settings-group,settings-grid}.svelte`
- `apps/desktop/src/lib/settings/component/`, `apps/desktop/src/lib/organization/component/settings-*.svelte`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- Reading order stays source order; no masonry.
