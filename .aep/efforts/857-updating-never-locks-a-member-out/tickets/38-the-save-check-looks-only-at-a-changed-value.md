---
status: resolved
---

# fix(records): the save check looks only at a value the person changed

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found by the research of 2026-10-07: once two different records share a value made apart, the save check of ticket 34 refused any edit of either, even one that left that value alone. An edit is checked only on a unique field it changes, so two records that already share a value stay fully editable.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [x] Editing a tenant, complex or contract that shares a value with another record, without changing that value, saves; a test per table over a workspace without the unique indexes.
- [x] Changing a unique field to a value another live record holds is still refused with today's message; the import writes keep their check; tests.

## Relevant areas

- apps/desktop/src/lib/tenant/, complex/, contract/ (acts, the holding helpers)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say so if none.
