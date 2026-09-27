---
status: resolved
blocked-by: [26]
---

# feat(organization): a copy is taken before the organization changes format

## Outcome

The human's call, 2026-09-27. The owner's upgrade rewrites and re-signs every row of the
organization, and if it finishes wrong there is nothing to go back to. After this, the owner's
machine writes a copy of every table of the organization, as it stands after the pull, to a file of
its own under the application's data directory before the transaction starts, and reads it back
complete; where the machine holds the owner's Turso account it also makes a protected copy of the
database there. A local copy that cannot be written refuses the upgrade and nothing is written. The
copy module is shared, and ticket 28 uses it for workspaces. [[efforts/838-permissions-are-a-role-and-an-override/plan]], *A copy before every
change*, gives the shape.

## Acceptance Criteria

Traces requirement 13 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `tauri/src/backup.rs` writes a logical copy: every table but SQLite's own and the engine's,
      created with its own statement and filled row by row, written as a `.partial` file, each
      table's row count compared with the source's, then renamed into
      `<data_dir>/backups/<database>/`. The three newest per database are kept.
- [x] `TursoPlatform::copy_database` makes a copy seeded from a database in the same group,
      protected from deletion, and removes one it cannot protect; the in-memory platform records
      it. The name fits Turso's 64 characters.
- [x] The owner's upgrade takes the local copy, and the remote one where `ItsRemote::account` is
      present, after the pull and the refusal checks and before the transaction; a test opens the
      local copy as a plain file and finds every table and row the organization held before and
      none of the changes, and finds the protected copy on the in-memory account.
- [x] A local copy that cannot be written refuses with `CopyNotTaken`, in English and Arabic,
      naming the directory, and the organization is unchanged. A test covers it.
- [x] A remote copy the account refuses is logged as `backup.remoteCopyRefused` and the upgrade
      goes on. A test covers it.
- [x] The log names where each copy is.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- new `tauri/src/backup.rs`; `tauri/src/organization/upgrade.rs` (`Replication`, `ItsRemote`),
  `sync/turso/platform.rs`, `error.rs`, `lib.rs` (the data directory), `organization/store.rs`
- `src/lib/error/tauri.ts`, `src/lib/i18n` (en and ar)
