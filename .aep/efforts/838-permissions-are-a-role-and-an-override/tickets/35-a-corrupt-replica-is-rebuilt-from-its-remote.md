---
status: resolved
---

# fix(desktop): a corrupt replica is rebuilt from its remote

## Outcome

A local replica the engine finds corrupt fails every open today, and nothing moves the user on.
After this, as Firefox does with a damaged database, the file is set aside under a name that says
so, the log names what was lost, and the database is pulled again from its remote.

## Acceptance Criteria

Traces requirement 17 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] Opening or first reading a workspace or organization replica that answers `Corrupt` or
      `NotADB` renames it and its sync metadata to `<name>.corrupt-<ms>`, logs it, and opens it
      again from its remote. Tests cover a file that is not a database and a truncated one.
- [x] The rebuild happens once per open; a second failure is refused as today.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/database/mod.rs` (`connect_workspace`, `open_replica`, `remove_replica_files`),
  `tauri/src/organization/command.rs` (`open_replica`), `sync/turso/platform.rs`
