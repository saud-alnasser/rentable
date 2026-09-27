---
status: resolved
blocked-by: [36]
---

# feat(desktop): the way in offers to bring the earlier records

## Outcome

With ticket 36 the records can be read; nothing yet tells the person they are there. After this,
the way in says in one line that the earlier version's records are on this machine and will be
brought in once a workspace exists, and the workspace group of settings shows a callout offering to
bring them in, through the existing import dialog, until they are brought in or dismissed, as
[[efforts/838-permissions-are-a-role-and-an-override/plan]], *Before Turso, a guided move*, gives it.

## Acceptance Criteria

Traces requirement 18 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The way in shows the line only where the file holds records. A component test covers both.
- [x] The callout opens the import dialog over the earlier records, with the plan shown before
      anything is written, and names the workbook kept in `backups/app/`. It needs the import
      flags; without them it says why. Brought in or dismissed, it goes, and stays gone.
- [x] English and Arabic; the design follows `rules/interface` and the design system.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass; `cargo test` passes.

## Relevant areas

- `src/lib/workspace/component/transfer.svelte`, `import-dialog.svelte`, the way-in routes,
  `src/lib/i18n`
