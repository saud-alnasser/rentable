---
status: resolved
---

# fix(records): the heal never hides, doubles or misreads a record

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

Found by the review of the reopened work: the heal compared a contract's derived `status` as if a person entered it, left a copy hidden forever when its survivor was deleted, let an edit on a just-retired copy wait for another machine's sync, filtered only the first table of a comma join, and deleted contract links by `rowid`.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [x] A contract's `status`, and every other column the app derives rather than a person enters, is left out of the comparison and of the carry of later edits; two copies of the same contract, one paid and one not, pair, and the payment counts once; a test reproducing the review's case.
- [x] A retired record whose survivor no longer exists has `merged_into` cleared and reappears, on every build from this branch; a test with the survivor deleted (as a 0.20 user deleting the copy they see would).
- [x] The pass also runs after this machine's own writes when they touch a retired record, so an edit saved to a just-retired copy reaches its survivor without waiting for another machine; a test.
- [x] `keepRetiredOut` filters every retirable table of a comma join; a test.
- [x] The heal never targets `contract_unit` rows by `rowid`; it keys them by the link's own columns; a test, and the live heal test still passes on throwaway databases.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs, database/mod.rs
- apps/desktop/src/lib/platform/database/retired.ts

## Constraints

- Live tests touch only throwaway databases the test creates and deletes in the Turso group `rentable`; the group is listed before and after.
- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset only if a user can observe it; say why in Notes if none.

## Notes

- **The derived columns** on the five kinds that heal are a unit's `status`, and a contract's
  `paid_amount`, `expected_amount` and `status`; a tenant, a complex and a payment hold none.
  `deriveContractStatus` keeps `terminated` as it finds it, so whether a contract was terminated
  is a person's act: that much of `status` is still compared and carried, and the rest is not. A
  copy terminated after its merge terminates the contract that stayed; one unterminated is written
  `active`, which the reconcile after the pass derives from.
- **A copy is shown again** wherever its chain of `merged_into` does not reach a record shown,
  the record gone or the chain running round; both columns are cleared, and the next step of the
  same pass retires it again if it is still a copy of one shown.
- **This machine's own writes** owe the pass where a statement names a table that heals with a
  word that writes, and the workspace holds a retired record; the next heartbeat runs it.
- **No changeset.** The heal has not shipped; ticket 35 brought it on this branch, and nothing here
  is observable against a release.
