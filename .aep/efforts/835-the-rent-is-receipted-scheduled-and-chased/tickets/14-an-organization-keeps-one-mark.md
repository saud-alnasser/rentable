---
status: resolved
blocked-by: [13]
---

# feat(organization): an organization keeps one mark

## Outcome

An organization database holds one image, a signature or a seal, sealed under the content key,
which the owner or an administrator sets, replaces or removes, and which every member's machine
reads after it pulls.

## Acceptance Criteria

Traces requirement 13 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]].

- [x] `organization_mark` is the eleventh table, created by `CREATE TABLE IF NOT EXISTS`, and an
      older replica gains it on pull (store test).
- [x] Setting, replacing and clearing the mark as the owner or an administrator round-trips the
      image sealed; as a member it is refused (criterion 13(b), Rust tests).
- [x] An image over 512 KB, or whose first bytes are not PNG, JPEG or WebP, is refused with a
      sentence (criterion 13(d), Rust tests).
- [x] A mark written through one store is read through another after a push and a pull (criterion
      13(c), Rust test over two replicas, as the store's own sync tests do).
- [x] [[contexts/desktop/organization]] names the mark and counts eleven tables.

## Constraints

- The data at rest changes: one new table in every organization database. Decided by the human on
  2026-09-25.
