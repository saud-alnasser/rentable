---
status: open
---

# fix(records): uniqueness is checked when saving, with today's words

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

The tenant, complex and contract acts refuse a phone, national ID, complex name or government ID already in use by reading the workspace, so a person online meets exactly today's messages without the shared database's rule.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [ ] Creating or editing a tenant with a phone or national ID another live tenant has, a complex with another's name, or a contract with another's government ID is refused with today's message for that field (`tenant.phoneTaken` and its siblings), naming the other record where today's does; editing a record to its own value is not refused.
- [ ] Records retired by a merge (`merged_into` set, ticket 35) are not counted as holding a value; the check is written so that column can join it without changing the acts.
- [ ] Tests per act and per field, in Arabic and English, pass with the database's unique indexes absent.

## Relevant areas

- apps/desktop/src/lib/tenant/, complex/, contract/ (acts, refusal, i18n)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
