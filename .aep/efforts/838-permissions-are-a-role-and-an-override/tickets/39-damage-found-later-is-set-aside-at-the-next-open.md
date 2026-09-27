---
status: resolved
---

# fix(desktop): damage found after the open is set aside at the next open

## Outcome

Review round one of tickets 32 to 37. A replica is set aside only when its damage shows at the open
or the first read of the schema, so a damaged data page is met by every later query and never
rebuilt. The truncation check also runs before the sync engine can finish restoring a replica it
was replacing, and would set that aside with the unsent writes the engine would have kept. And the
earlier records' export leaves out rows whose parent is missing without a word. After this, as
[[efforts/838-permissions-are-a-role-and-an-override/plan]]'s review note gives it, damage reported later marks the replica and its next open sets
it aside; a replica with the engine's replace-base marker is left to the engine; and rows left out
of the earlier records are counted in the log.

## Acceptance Criteria

Traces requirement 17 and requirement 18 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] A query on an open replica answering `Corrupt` or `NotAdb` records the replica as damaged
      beside it and logs it; the next open sets it aside as a damaged open does. A test covers it.
- [x] Where the sync engine's replace-base marker stands beside a replica, the truncation check
      leaves it to the engine. A test covers it.
- [x] The earlier records' reader logs how many units, contracts and payments it left out for a
      missing parent, by kind. A test covers it.
- [x] `database/corrupt.rs` spells SQLite's magic with its escape, with no raw NUL in the source.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/database/corrupt.rs`, `database/mod.rs`, `tauri/src/earlier.rs`
