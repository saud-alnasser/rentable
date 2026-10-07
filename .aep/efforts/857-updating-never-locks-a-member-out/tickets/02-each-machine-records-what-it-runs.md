---
status: resolved
blocked-by: [01]
---

# feat(organization): each machine records what it runs

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `organization/store/`; Data Model*).

## Outcome

Each machine writes, for itself, the rentable version it runs and the workspace step and format step it knows into the organization's new `machine_version` table, whenever any of them changes, so an upgrade can name who is behind.

## Acceptance Criteria

Traces requirement 4 and criterion 4.

- [x] `machine_version` is created by `complete_schema` as an addition, unsigned, one row per machine written only by that machine.
- [x] It is written at connect, sign-in, resume and on the heartbeat when the value differs from the row standing, on the `machine_name` pattern, and never on a pull that changed nothing.
- [x] A test signs in two sessions with different `known()` values and reads each machine's rentable version, workspace and format steps, and the machine's `seen_at`; changing one build's values changes its row on the next launch.

## Relevant areas

- apps/desktop/tauri/src/organization/store/session.rs (`machine`, `machine_name`)
- apps/desktop/tauri/src/organization/session/machine.rs (`machine_kept`, `named`)
- apps/desktop/tauri/src/organization/store/mod.rs (`TABLES`, `complete_schema`)

## Constraints

- A column on `machine` is ruled out: a pre-857 build's whole-row `INSERT OR REPLACE` would wipe it.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
