---
status: open
---

# fix(records): the heal never hides, doubles or misreads a record

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found by the review of the reopened work: the heal compared a contract's derived `status` as if a person entered it, left a copy hidden forever when its survivor was deleted, let an edit on a just-retired copy wait for another machine's sync, filtered only the first table of a comma join, and deleted contract links by `rowid`.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [ ] A contract's `status`, and every other column the app derives rather than a person enters, is left out of the comparison and of the carry of later edits; two copies of the same contract, one paid and one not, pair, and the payment counts once; a test reproducing the review's case.
- [ ] A retired record whose survivor no longer exists has `merged_into` cleared and reappears, on every build from this branch; a test with the survivor deleted (as a 0.20 user deleting the copy they see would).
- [ ] The pass also runs after this machine's own writes when they touch a retired record, so an edit saved to a just-retired copy reaches its survivor without waiting for another machine; a test.
- [ ] `keepRetiredOut` filters every retirable table of a comma join; a test.
- [ ] The heal never targets `contract_unit` rows by `rowid`; it keys them by the link's own columns; a test, and the live heal test still passes on throwaway databases.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs, database/mod.rs
- apps/desktop/src/lib/platform/database/retired.ts

## Constraints

- Live tests touch only throwaway databases the test creates and deletes in the Turso group `rentable`; the group is listed before and after.
- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say why in Notes if none.
