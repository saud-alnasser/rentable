---
status: resolved
---

# fix(sync): a setup interrupted by a restart keeps its Turso consent's details

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 39, criterion 39; requirement 14). *From review round two, decided by the human 2026-10-06.*

## Outcome

The machine's record writes the pending consent's Turso organization under a key of its own, apart from the top-level `tursoOrganization` that mirrors the selected organization's for older builds, and reads it back at load; a restart between a consent and its create finds it again.

## Acceptance Criteria

Traces requirement 39 and criterion 39.

- [x] `remote-sync.json` carries the pending Turso organization under its own key (never `organizations`), written whenever it is set and cleared when a create or connect takes it; the top-level `tursoOrganization` still mirrors the selected organization's for older builds.
- [x] Criterion 39's Rust test: consent granted while another organization with its own Turso organization is selected, the record reloaded, the pending one found and the selected one unchanged; the existing record, consent-move and end-to-end update tests pass.
- [x] The full Rust suite, `cargo fmt --check` and clippy pass with no new warnings.

## Relevant areas

- `apps/desktop/tauri/src/machine/record.rs` (`WrittenRecord`, `sanitize`, `hold_consented`), `organization/setup/mod.rs`, `upgrade/consent.rs`
