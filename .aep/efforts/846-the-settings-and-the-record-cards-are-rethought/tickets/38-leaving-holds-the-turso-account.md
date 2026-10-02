---
status: open
blocked-by: []
---

# feat(desktop): leaving holds the Turso account, and a button says its act without a repeated glyph

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "maybe i find it odd using the same icon of the sectio ntitle and descripto in the action button; espclillly on the leaving section hand over owenrhips should be named transfer ownership and the button should be transfer and in red and without icon the same for disconnect and delete without the icon; also i find it odd mutliple things change the org; the leavilng section the turso account section all feels odd and the same thing meabye tusro account section shoud'nt be there since disconnect this meachine does the same from what i understand; also i like that the roles are orderd cards but the looks of them and not using icons feels odd they should match the cards that use icons ad badges like the members card"; then "the sync button should be the icon only with tooltip maybe"; and, asked about the Turso card, "Fold it into Leaving". (1) No settings button repeats the glyph its row or card already shows: a row's control is words alone, or an icon alone named by a tooltip, never the row's own glyph again (this binds every tab; [[rules/interface]] and [[contexts/desktop/components]] say so). (2) The leaving card: *hand over ownership* is renamed *transfer ownership* (Arabic to match) and its button reads *transfer*, red, no glyph; *disconnect this machine* and *delete organization* have red text buttons, no glyph. (3) The Turso account card goes: in the leaving card, for an owner, a Turso account row states connected on this machine or not held here (with *reconnect*), and *forget Turso account* is a red act there, confirmed as today. A member's leaving card is unchanged but for the button words. (4) The sync card's *sync* control is an icon button named by its tooltip, its glyph turning while a sync runs and still under reduced motion, as the update check's does (ticket 34).

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirements 2, 13 and 14.

- [ ] The area test walks every settings card and finds no button whose glyph is its row's or card's own glyph.
- [ ] The leaving card reads transfer ownership with a red text *transfer*, and red text disconnect and delete, in both locales; the transfer still opens the offer form, refused with its reason where nobody can take it.
- [ ] There is no Turso account card; an owner's leaving card holds the Turso row (connected, or not held with reconnect) and forget, confirmed; a member's has neither.
- [ ] Sync is an icon button named by its tooltip, its glyph spinning with `aria-busy` while a sync runs and not under reduced motion.
- [ ] [[rules/interface]] and [[contexts/desktop/components]] say all of this; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/organization/component/{settings-organization,leaving,standing}.svelte`, `apps/desktop/src/lib/organization/setup/component/`, every settings row's control

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
