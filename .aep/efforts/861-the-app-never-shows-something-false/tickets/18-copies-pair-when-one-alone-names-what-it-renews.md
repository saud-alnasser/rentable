---
status: resolved
---

# fix(desktop): copies pair when one alone names what it renews

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 5, replication; requirement 6, *Risks*), and ticket 10. Found at review round 1 (correctness).

## Outcome

Two copies of one contract made apart still heal into one when one copy carries the renewal link and the other does not yet, as happens when one machine's reconcile recognised the renewal before the copies met or when an older build made the other copy; the survivor keeps the link.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (replication).

- [x] `heal.rs` compares `renews_contract_id` so that an empty link pairs with a set one, two set links pair only when they name the same contract once normalised to its final target, and the survivor carries the set link whichever copy survives; a Rust test lays the pair down in both orders and gets the same survivor and link, and a second pass writes nothing. Verified: `cargo test heal` with the `_t10` target: 24 passed, 0 failed; `copies_pair_when_one_alone_names_what_it_renews` runs either copy holding the link in both insertion orders, under one tenant and two tenant copies, finds survivor C1 naming P1 each time, identical tables across orders, and a second pass returning `Healed::default()`; it failed before the fix.
- [x] Two copies naming different predecessors still do not pair; a Rust test covers it. Verified: the same run: `copies_naming_two_predecessors_do_not_pair` passes under one tenant and under two tenant copies; `a_contract_never_pairs_with_the_one_it_renews` covers a copy naming the other.
- [x] Kinds without the link pair exactly as before; the existing heal tests pass. Verified: the key and partner choice are unchanged for them, and every earlier heal test passes in the same run; the child's full `cargo test` printed 980 passed, 0 failed.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs (`key_of`, the kin normalisation, the survivor's write)
- .aep/contexts/desktop/contract.md (*Renewal link*, the heal sentence)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The heal stays deterministic across machines and idempotent.
- No changeset: it restores what replication did before the link existed; say so in Notes.

## Notes

No changeset: this restores what replication did before the link existed, when two copies of
one contract made apart always paired.

What a copy names it renews is left out of the key the heal groups and pairs by, and
`kin_fits` decides it: a copy naming none fits any, two naming one must name the same once
normalised, and neither may name the other, so a contract alike in all else to the one it renews
never pairs with it and the survivor never renews itself. A copy pairs first with one naming what
it names; under a retired parent it falls back to one it merely fits only in the round that would
otherwise move it, so a renewal of a copy still waits for that copy to be retired, as ticket 10
needs. Where two copies name two predecessors and a third names none, the third joins the
earliest set it fits, by id, the same on every machine. The survivor takes
the link where it named none, written as one statement and counted as carried.
