---
status: resolved
blocked-by: [24]
---

# fix(organization): an upgraded organization is never upgraded again

## Outcome

Review round two of the upgrade, correctness. Today a format 2 organization can be made to look
older, because the `format` row is unsigned. A member holds full access to the organization
database, so they can:

- delete the `format` row;
- recreate `administrator_certificate`;
- add back the old member columns;
- replay a `member.v2` row they once held.

The owner's next sign-in then signs that replayed promotion from the root, undoes a removal, and
deletes every member who holds a custom role.

The review found more problems:

- An owner whose grant had lapsed could never upgrade, and was told to connect.
- Captured old-build changes left the owner's machine refused with the wrong sentence.
- A `format` row written into a remote still in format 1 shape stopped everyone.
- An unsigned `revoked_at` wrote away the workspaces the administrator had signed.
- A row signed under a revoked or unknown certificate made the directory unreadable for everyone.

After this:

- A machine that has once read the organization as format 2 never transforms it again.
- The owner's upgrade transforms nothing where genuine format 2 rows are present, and custom roles
  survive.
- A lapsed owner grant is renewed from the owner's own account.
- Each stuck case names its way out.
- A row that does not verify is left out of what is read, and logged, rather than refusing the
  directory. That is the rule ticket 20 set for member rows, now applied to every row kind.

## Acceptance Criteria

Traces requirement 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] A machine that has read the organization as format 2 keeps that fact locally, outside the
      organization database. It never transforms the organization again, whatever the remote's
      `format` row says. A test covers each step:
      1. upgrade;
      2. delete the `format` row;
      3. recreate the old table and columns;
      4. replay an old `member.v2` promotion;
      5. sign in and resume as the owner.

      The test finds nothing written and the replayed row granting nothing.
- [x] The owner's upgrade, on a machine with no such local fact, refuses to transform when the
      organization holds a root certificate that verifies under the pinned key. A test covers it.
- [x] Where a `role` table exists, the upgrade judges members against its verified role rows, so a
      holder of a custom role is carried, not deleted. A test covers it.
- [x] A `format` row present on a database that still carries format 1's table or columns reads as
      unfinished. A missing `format` table is created by the upgrade's last step. A test covers each
      case.
- [x] The owner's upgrade, when the grant on the organization database is lapsed or missing, renews
      it through the owner's own Turso account, the way `setup::connect_existing` mints one, before
      it pushes. A test covers it.
- [x] A member whose pull is refused for a lapsed or missing credential is told the machine needs a
      new link from their organization, not that it waits for its owner. This is in English and
      Arabic, and a test covers it.
- [x] Captured old-build changes a reshaped remote cannot accept (the measured
      `Number of arguments mismatch`) give their own reason, in English and Arabic. The reason says
      that disconnecting this machine and connecting again drops those unsent changes. Nothing is
      written, and a test covers it.
- [x] A workspace row whose format 1 signature verifies is carried, whatever an unsigned
      `revoked_at` says of its certificate. Grants, invitations and member rows still follow the
      revocation. A test covers it.
- [x] A workspace, grant, invitation or mark row signed under a revoked or unknown certificate, or
      beyond what its certificate covers, is left out of what the directory reads and logged. It
      never refuses the whole read. The rows beside it still read. A test covers each row kind.
- [x] `planned` meets a replica without a `succession` table the way `settled` does, and a test
      covers it.
- [x] Where more than one member row's vault opens with the owner's password, the owner's row is the
      one whose format 1 signature verifies as the owner's. A test inserts a copy.
- [x] Two comments are corrected:
      - `database/test/workspace.rs` points the 2026-09-26 measurement at
        `OrganizationStore::format_one_reshape`;
      - the `refuse_another_format` doc and the `waits_for_its_owner` doc in `store.rs` say what is
        true ("nothing was written to the organization").
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `store.rs` (`is_older`, `carries_format_one`, the `verified`
  reads, `refuse_another_format`, `waits_for_its_owner`), `setup.rs` (`connect_existing`,
  `owner_platform`, the held organization record), `sync/store.rs`, `authority.rs`, `error.rs`,
  `database/test/workspace.rs`
- `src/lib/error/tauri.ts`, `src/lib/i18n` (en and ar)
