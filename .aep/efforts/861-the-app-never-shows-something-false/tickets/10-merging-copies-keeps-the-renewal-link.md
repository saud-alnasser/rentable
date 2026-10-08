---
status: open
blocked-by: [09]
---

# fix(desktop): merging copies keeps the renewal link

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `tauri/src/database/heal.rs`*).

## Outcome

When identical records made apart heal into one, a successor naming a retired copy is moved to the survivor, and two copies of a successor whose predecessors were themselves copies still pair.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (replication).

- [ ] `heal.rs` moves `renews_contract_id` off a retired contract to its target, beside `links_moved`; a Rust test shows the survivor keeps its successor's link.
- [ ] Copies are compared with `renews_contract_id` normalised to its final target, as `parent` is; a Rust test pairs two such copies.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs, database/mod.rs (`heal`)
- apps/desktop/src/lib/platform/database/retired.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The heal stays deterministic across machines and idempotent.
- No changeset: nothing here is observable by a user on its own; say so in Notes.

## Notes
