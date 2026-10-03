---
status: resolved
blocked-by: [02]
---

# feat(desktop): ending soon is set from the dashboard

Blocked by: 02

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The ending-soon section's header carries the control the plan's *Ending soon on the dashboard* describes, and with no contract in the window the header is still drawn with it. Every reader of the rank refreshes when it changes. The command menu finds it. It leaves general, with its component and test deleted, and [[rules/interface]]'s *Landing screen* says what was built.

## Acceptance Criteria

Traces requirements 3, 6, 7 and 22, and criteria 3, 6, 7 and 22.

- [x] `dashboard/tests/landing.svelte.test.ts`: the header control changes the days through the mutation and the refetched data redraws the section and the band. *Verified: `vitest run dashboard/tests/landing.svelte.test.ts shell/tests/places.svelte.test.ts app/tests/settings-area.svelte.test.ts` printed 3 files, 48 passed; the landing test sends `settings.set({endingSoonNoticeDays: 61})` and the refetch fills the section and moves the band's figure from 4750 to 4900.*
- [x] With no ending-soon rank, the header is drawn with *none end within the next {n} days* and the control; an answer holding the rank fills it. *Verified: the same run: with no ending-soon rank the header reads none end within the next 30 days with the control, and typing 90 fills it in place.*
- [x] An invalid value marks its own field; a rejected write puts the old value back. *Verified: the same run: 0, empty and 2.5 each set `aria-invalid` with the message tied to the field and write nothing; a rejected write puts 60 back.*
- [x] Changing the days invalidates the contracts list and record keys as well as the dashboard's. *Verified: the same run: the readers invalidate the dashboard key, the contract list keys and a contract's record and schedule keys (the dashboard surface contributes `[keys.all, prefixOf('contract')]`; narrowed to the dashboard key the test failed).*
- [x] The palette offers ending soon, and `/?ending-soon` opens the control and clears the parameter. *Verified: the same run: `places.svelte.test.ts` offers `/?ending-soon` for "ending soon" in English and Arabic, and the landing test opens the control and replaces the address with `/`.*
- [x] General shows no ending-soon control; `settings/component/ending-soon.svelte` and its test are gone. *Verified: the area test (same run) finds no ending-soon text, number field or save button in general; `ls settings/component | grep -c ending` printed 0.*
- [x] *Landing screen* says a section may carry the control for the setting that defines it, and its header stands with no rows. *Verified: read rules/interface's *Landing screen*: a section may carry the control for its defining setting and its header stands with no rows.*

## Relevant areas

- `apps/desktop/src/lib/dashboard/{component/landing.svelte,component/section.svelte,surface.ts}`
- `apps/desktop/src/lib/settings/{query.ts,ui.ts,component/area.svelte,component/ending-soon.svelte}`
- `apps/desktop/src/lib/contract/surface.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
