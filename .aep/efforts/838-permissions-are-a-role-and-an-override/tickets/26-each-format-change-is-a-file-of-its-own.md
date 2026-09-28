---
status: resolved
---

# refactor(organization): each format change is a file of its own

## Outcome

The human's call, 2026-09-27. `upgrade.rs` holds the runner and the format 1 to 2 change in one
file, so the next format would be written into the middle of the first. After this, each change of
format is a file under `organization/transition/`, listed in order in `transition/mod.rs`; the
runner in `upgrade.rs` walks the list from the format the organization is in to the one this build
ships, in one transaction, and writes the `format` row last; and `FORMAT_VERSION` is counted from
the list. Nothing an organization, an owner or a member meets changes, as
[[efforts/838-permissions-are-a-role-and-an-override/plan]], *Each format change is a file*, gives it.

## Acceptance Criteria

Traces requirement 14 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `organization/transition/mod.rs` holds `TRANSITIONS`, each entry naming the format it starts
      from, a name for the log, a refusal check over the directory as it stands, and the plan it
      makes and applies inside the runner's transaction. Its module comment says how the next
      format is added.
- [x] `organization/transition/two.rs` holds what is format 1's alone (the judge, the
      carried permissions, the plan and its steps, `holds_a_root`), and `upgrade.rs` holds none of
      it.
- [x] `FORMAT_VERSION` is `TRANSITIONS.len() + 1`, and a test fails a list whose starting formats
      are not 1, 2, 3 in order.
- [x] The runner reads the format as the `format` row, or 1 where the table does not stand; the
      machine's own `known_format` refuses any entry starting below it; and each entry's refusal
      check runs before anything is written.
- [x] A test-only entry from the shipped format to the next is walked by the same runner for an
      organization in the shipped format, with the transaction and the `format` row, and nothing
      outside the test touched.
- [x] Every test of tickets 22 to 25 passes unchanged but for the paths it imports from.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `store.rs` (`FORMAT_VERSION`, `format`, `write_format`,
  `carries_format_one`, `is_older`), `mod.rs`
