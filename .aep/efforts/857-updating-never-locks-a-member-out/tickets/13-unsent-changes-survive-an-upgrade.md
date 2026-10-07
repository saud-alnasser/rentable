---
status: open
blocked-by: [07]
---

# fix(sync): unsent changes survive an upgrade

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Testing Strategy, criterion 10; Technical Risks*).

## Outcome

Changes a machine had not sent when an upgrade stopped it are sent once it has updated; where the upgrade removed what they name, the push is classified, nothing is dropped, and the person is asked before the changes are discarded.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [ ] A workspace push that fails because the upgrade removed what the changes name is classified as `ChangesUnsendableAfterUpgrade`, kept, and surfaced with a sentence and a choice; nothing is dropped without the person's yes.
- [ ] Live tests behind `RENTABLE_LIVE_TURSO=1`, on throwaway databases only, push captured changes after an addition (sent) and after a removal (asked).
- [ ] Unit tests cover the classification and the choice.

## Relevant areas

- apps/desktop/tauri/src/database/mod.rs (`replicate_engine`, push)
- apps/desktop/tauri/src/upgrade/format/runner/replication.rs (`classified`)
- [[efforts/857-updating-never-locks-a-member-out/evidence/prototypes/an-older-replica-pushes-after-an-added-column]]

## Constraints

- Live runs only in Turso group `rentable` of account `saud-alnasser`, creating and deleting throwaway databases; never an existing database. This is the human's bound of 2026-10-07.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
