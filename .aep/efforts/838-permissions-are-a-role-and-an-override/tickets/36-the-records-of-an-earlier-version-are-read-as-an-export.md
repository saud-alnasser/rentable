---
status: resolved
---

# feat(desktop): the records of an earlier version are read as an export

## Outcome

0.12.0 and 0.13.0 kept every record in `app.db` and this build never reads them, so a person
updating from either finds nothing. After this, a command reads that file, read-only, at schema 2
or 3, into the whole-workspace export's tables, and writes the same tables as the export workbook
under `backups/app/`, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Before Turso, a guided move*, gives it. Ticket 37 puts it
in front of the person.

## Acceptance Criteria

Traces requirement 18 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] A command answers whether `app.db` holds records of an earlier version, and which, without
      writing to it.
- [x] A command reads them into the tables `import_read_book` returns, in `TRANSFER_COLUMNS`, and
      writes them as the export workbook to `backups/app/workspace-<version>.xlsx`. Tests build
      the file at schema 2 and 3 from the migrations 0.12.0 and 0.13.0 shipped, with a record of
      every kind, and find every record in the tables and the workbook written.
- [x] A TS test runs `planWorkspaceImport` over those tables and finds every record created.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/database/mod.rs`, `export.rs`, `import.rs`, `lib.rs` (commands), `tauri/migrations/`,
  `src/lib/platform/tauri.ts`, `src/lib/workspace/workspace.ts`
