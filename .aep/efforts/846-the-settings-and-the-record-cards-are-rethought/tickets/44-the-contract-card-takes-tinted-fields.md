---
status: open
blocked-by: [41]
---

# feat(desktop): the contract card takes tinted fields

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's word of 2026-10-03: "follow the tinted files and things like that in the reocrds cards of domain data". The contract card is redrawn in the member card's family: its heading as today, then its reference, dates, units, cost per interval and payments as fields, the paid-of-expected ring kept where it reads best, the tenant and labelled status on the heading, each a `Cell.Field`, in a grid two across; its declared height recomputed and exported. Acts, routes and list behaviour unchanged.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 18 and 19.

- [ ] The contract card test finds its fields as `Cell.Field`s with a glyph, a name and a value, in both locales, with no zero drawn as a figure.
- [ ] The directory passes the recomputed height, and its list tests (search, filter, sort, keyboard, selection, acts) pass.

## Relevant areas

- `apps/desktop/src/lib/contract/component/record.svelte` and its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]]; every line at a fixed leading so the declared height holds in Arabic.
