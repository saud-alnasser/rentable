---
status: open
blocked-by: [02]
---

# feat(desktop): ending soon is set from the dashboard

Blocked by: 02

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The ending-soon section's header carries the control the plan's *Ending soon on the dashboard* describes, and with no contract in the window the header is still drawn with it. Every reader of the rank refreshes when it changes. The command menu finds it. It leaves general, with its component and test deleted, and [[rules/interface]]'s *Landing screen* says what was built.

## Acceptance Criteria

Traces requirements 3, 6, 7 and 22, and criteria 3, 6, 7 and 22.

- [ ] `dashboard/tests/landing.svelte.test.ts`: the header control changes the days through the mutation and the refetched data redraws the section and the band.
- [ ] With no ending-soon rank, the header is drawn with *none end within the next {n} days* and the control; an answer holding the rank fills it.
- [ ] An invalid value marks its own field; a rejected write puts the old value back.
- [ ] Changing the days invalidates the contracts list and record keys as well as the dashboard's.
- [ ] The palette offers ending soon, and `/?ending-soon` opens the control and clears the parameter.
- [ ] General shows no ending-soon control; `settings/component/ending-soon.svelte` and its test are gone.
- [ ] *Landing screen* says a section may carry the control for the setting that defines it, and its header stands with no rows.

## Relevant areas

- `apps/desktop/src/lib/dashboard/{component/landing.svelte,component/section.svelte,surface.ts}`
- `apps/desktop/src/lib/settings/{query.ts,ui.ts,component/area.svelte,component/ending-soon.svelte}`
- `apps/desktop/src/lib/contract/surface.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
