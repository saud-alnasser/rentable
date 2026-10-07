---
status: open
blocked-by: [03, 04, 07]
---

# test(upgrade): every shipped version carries across

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Migration; Testing Strategy, criterion 13; Integration*).

## Outcome

Organizations and workspaces seeded at every version shipped since 0.14.0 open on this build as the owner and as a member with every row intact, both floors equal to their version, and nothing asked of anyone; the persistence and organization contexts describe the floors.

## Acceptance Criteria

Traces requirement 13 and criterion 13.

- [ ] A test per shipped workspace version (5, 6, 7) and organization format (2, 3) opens the seed as the owner and as a member and finds every row, floors equal to the version, and no setup step.
- [ ] Format 1 still walks through the owner's upgrade as effort 838 built it.
- [ ] [[contexts/desktop/persistence]] and [[contexts/desktop/organization]] describe the two kinds, the floors and the legacy numbers.

## Relevant areas

- apps/desktop/tauri/src/organization/lease/apply.rs (seeds per version)
- apps/desktop/tauri/src/upgrade/format/test/
- .aep/contexts/desktop/persistence.md, organization.md

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
