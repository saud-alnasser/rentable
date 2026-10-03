---
status: resolved
blocked-by: []
---

# feat(desktop): a member card shows its facts as four tinted fields

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "i like the information showen an d the icons on the members card in the org section; but the way their shown the place they are on; mabye there should be  on the card grid of tintied 4 filieds and thier icons and text on it thigns like that do your best desgin". The member card (ticket 32) keeps its heading (avatar, username, role badge) and its information, and lays the four facts as a 2 by 2 grid of tinted fields: each field a softly tinted rounded tile holding its glyph, a small muted label (password, machine, workspaces, joined) and the value under it (set or not yet; signed in or none; the count, or none; the date). The two facts that appear only when they apply (permissions of their own, offered the organization) sit as small badges at the card's foot. The fixed tile height is recomputed so English and Arabic hold it. The agent makes the design call (tint, spacing, type sizes) by [[rules/interface]]'s visual reference and [[contexts/desktop/components]].

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirement 19.

- [x] The member card test finds four fields in a two-column grid, each with an svg, a label and a value, in both locales; the conditional facts as badges only when they apply; no count of zero drawn as a figure. *Verified: integrated on 36, `vitest run src/lib/organization app/tests/settings-area.svelte.test.ts` printed 24 files, 435 passed; the member card test finds four fields in a two-column grid, each with an svg, a name and a value, in en and ar; the conditional facts as badges only when they apply; a zero drawn as none.*
- [x] `MEMBER_TILE_HEIGHT` is recomputed and the directory's grid, search, sort, acts and sheet tests pass. *Verified: the same run: `MEMBER_TILE_HEIGHT` 228 and the directory's grid, search, sort, acts and sheet tests pass; i18n tests pass 29; check 0 errors.*
- [x] [[rules/interface]]'s *List presentation* describes the member tile as built; `validate.mjs` passes. *Verified: read rules/interface *List presentation*: the member tile as built; `validate.mjs` printed no failures.*

## Relevant areas

- `apps/desktop/src/lib/organization/member/component/card.svelte`, its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
