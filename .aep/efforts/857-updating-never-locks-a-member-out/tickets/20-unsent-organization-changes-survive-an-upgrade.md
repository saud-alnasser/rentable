---
status: open
blocked-by: [19]
---

# fix(sync): unsent organization changes survive an upgrade

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at converge round one: the organization replica gets the protection ticket 13 gave workspaces; a push that fails because an organization upgrade removed what the changes name is classified, the replica is held from any further push or pull, and nothing is dropped without the person's yes.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [ ] The organization store's push classifies a failure naming what an upgrade removed as `ChangesUnsendableAfterUpgrade`, records the hold beside the replica, and refuses further pushes and pulls of that replica until it is resolved.
- [ ] The person sees the sentence and the choice; discarding needs a confirmed yes and reopens the organization from Turso; unit tests cover the classification, the hold and the choice.
- [ ] The comment in `organization/store/mod.rs` saying what could not be sent goes with the next push is corrected.
- [ ] A live test behind `RENTABLE_LIVE_TURSO=1`, on throwaway databases only in the group `rentable`, covers a removal after captured organization changes, and leaves no database behind.

## Relevant areas

- apps/desktop/tauri/src/organization/store/mod.rs (`push`), upgrade/format/runner/replication.rs
- apps/desktop/tauri/src/database/unsendable.rs, organization/session/unsent.rs (the workspace's pattern)
- apps/desktop/src/lib/organization/component/standing.svelte

## Constraints

- Live tests touch only throwaway databases the test creates and deletes; no existing database is read or written.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
