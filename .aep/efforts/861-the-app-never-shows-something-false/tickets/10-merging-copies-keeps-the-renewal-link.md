---
status: resolved
blocked-by: [09]
---

# fix(desktop): merging copies keeps the renewal link

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `tauri/src/database/heal.rs`*).

## Outcome

When identical records made apart heal into one, a successor naming a retired copy is moved to the survivor, and two copies of a successor whose predecessors were themselves copies still pair.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (replication).

- [x] `heal.rs` moves `renews_contract_id` off a retired contract to its target, beside `links_moved`; a Rust test shows the survivor keeps its successor's link. Verified: `cargo test renew` in apps/desktop/tauri with the warm `_t10` target: 8 passed, 0 failed, including `a_renewal_of_a_retired_copy_names_the_contract_that_stayed` (the successor names the survivor, counted beside `links_moved`; a second pass writes nothing); the child's full Rust run printed 977 passed, 0 failed.
- [x] Copies are compared with `renews_contract_id` normalised to its final target, as `parent` is; a Rust test pairs two such copies. Verified: the same run: `copies_of_a_renewal_of_copies_pair` pairs two copies whose predecessors were copies, under one tenant and under two copies of one tenant, in either order, and `renewals_of_one_copy_pair_in_the_pass_that_retires_it` covers a predecessor retired in the same pass.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs, database/mod.rs (`heal`)
- apps/desktop/src/lib/platform/database/retired.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The heal stays deterministic across machines and idempotent.
- No changeset: nothing here is observable by a user on its own; say so in Notes.

## Notes

No changeset: nothing here is observable by a user on its own. The heal only meets a renewal
link once a renewal writes one (ticket 11) or reconcile recognises one (ticket 12).

`retired.ts` needs no change. It keeps retired rows out of every read, including a join on
`renews_contract_id`, and points nothing anywhere; moving references to the survivor is the
heal's alone, as it is for `tenant_id` and the rest.
