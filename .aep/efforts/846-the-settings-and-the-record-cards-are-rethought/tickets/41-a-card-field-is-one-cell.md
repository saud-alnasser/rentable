---
status: open
blocked-by: []
---

# refactor(desktop): a card's tinted field is one cell

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's word of 2026-10-03: "follow the tinted files and things like that in the reocrds cards of domain data". Before four cards take it, the tinted field the member card (ticket 37) and the role card (ticket 39) each draw becomes one shared cell, `Cell.Field` beside `Cell.Fact` (glyph, small muted name, value in the stronger weight, `bg-muted`, `rounded-lg`, `px-3 py-2`, fixed leading, an empty value muted, an optional tone only where a value is a state), and both cards draw it. No visible change.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirement 19.

- [ ] `design/cell/field.svelte` exists with a component test (glyph, name, value, muted empty value, RTL); the member and role cards import it and carry no field markup of their own.
- [ ] The member and role card tests pass unchanged; the components context names `Cell.Field`.

## Relevant areas

- `apps/desktop/src/lib/design/cell/`, `apps/desktop/src/lib/organization/{member,role}/component/card.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]]; every line at a fixed leading so the declared height holds in Arabic.
