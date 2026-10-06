---
status: resolved
---

# fix(organization): a machine added by a machine link keeps its member's lock

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 38, criterion 38; requirement 35). *From review round two, decided by the human 2026-10-06.*

## Outcome

A machine link made for a locked member carries that the member was locked, sealed inside the link and bound as the link's other fields are; the machine it connects latches that member's own lock (`own_lock_latched`), so the member reads locked there with no lock row until a verifying unlock is read. A link made for an unlocked member latches nothing; a link made before this change reads as unlocked.

## Acceptance Criteria

Traces requirement 38 and criterion 38.

- [x] The machine link's sealed payload carries whether its member was locked when it was made, bound so it cannot be changed without the code; an older link without it reads as not locked.
- [x] Connecting by a machine link that says locked sets `own_lock_latched` for that member on the new entry; signing in there reads the member locked with no verifying row, and a verifying unlock clears it.
- [x] Criterion 38's Rust test, with the latch shown failing when removed; the existing machine-link tests pass.
- [x] The full Rust suite, `cargo fmt --check` and clippy pass with no new warnings.

## Relevant areas

- `apps/desktop/tauri/src/organization/invitation/{machine.rs,link.rs,mod.rs,connect.rs}`, `organization/member/lock.rs`, `organization/store/member.rs`, `machine/record.rs`
