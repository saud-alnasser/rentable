---
status: open
---

# fix(desktop): copies pair when one alone names what it renews

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 5, replication; requirement 6, *Risks*), and ticket 10. Found at review round 1 (correctness).

## Outcome

Two copies of one contract made apart still heal into one when one copy carries the renewal link and the other does not yet, as happens when one machine's reconcile recognised the renewal before the copies met or when an older build made the other copy; the survivor keeps the link.

## Acceptance Criteria

Traces requirement 5 and criterion 5 (replication).

- [ ] `heal.rs` compares `renews_contract_id` so that an empty link pairs with a set one, two set links pair only when they name the same contract once normalised to its final target, and the survivor carries the set link whichever copy survives; a Rust test lays the pair down in both orders and gets the same survivor and link, and a second pass writes nothing.
- [ ] Two copies naming different predecessors still do not pair; a Rust test covers it.
- [ ] Kinds without the link pair exactly as before; the existing heal tests pass.

## Relevant areas

- apps/desktop/tauri/src/database/heal.rs (`key_of`, the kin normalisation, the survivor's write)
- .aep/contexts/desktop/contract.md (*Renewal link*, the heal sentence)

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The heal stays deterministic across machines and idempotent.
- No changeset: it restores what replication did before the link existed; say so in Notes.

## Notes
