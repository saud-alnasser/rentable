---
status: resolved
blocked-by: [04]
---

# refactor(organization): grants, workspaces, the mark and the handover run on the delegated chain

## Outcome

Granting and withdrawing, renaming a workspace, setting the mark, renewing credentials and handing
the organization over run on the delegated chain and on flags: the mark on `manageMark`, the owner's
acts on the owner's verified row. The handover re-issues the root certificate under the new key and
every certificate the previous owner issued directly.

## Acceptance Criteria

Traces requirements 2 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 2 and 9.

- [x] `mark::require_administrator` is gone; setting and clearing the mark require `manageMark`.
- [x] `require_owner` and every `session.role == OWNER` check in these files read the verified row.
- [x] For each `OWNER_ONLY` act, a manager holding every other flag is refused and the owner
      succeeds; the owner's effective permissions equal every flag (criterion 2).
- [x] After a handover, every certificate verifies under the new pinned key, the previous owner reads
      as a manager, and a certificate they issued as owner is re-issued under the new owner.
- [x] A grant made by a manager verifies on a third store; a read-only grant signed by a non-root is
      refused on read.

## Relevant areas

- `organization/workspace.rs`, `mark.rs`, `role.rs` (`offer_ownership`, `accept_ownership`,
  `follow_succession`), `command.rs`

## Constraints

- 05 and 06 touch disjoint files except `command.rs`; each changes only its own commands there.
