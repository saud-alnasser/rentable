---
status: open
---

# test(organization): an install from the current release updates whole, with nothing typed and nothing pulled again

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 16, criterion 16, *Constraints*: the application has users). *Appended by converge, round one, 2026-10-05.*

## Outcome

One Rust test walks the whole update a user meets: a data directory written by the current release, with its `remote-sync.json`, organization and workspace replica files on disk, a remembered member key and an `owner` Turso consent in the keyring, is opened by this build; the launch converts the record, moves the consent, and resumes the selected organization with no password typed; the replica files are the same files, not pulled again; an owner-only act reaches Turso.

## Acceptance Criteria

Traces requirement 16 and criterion 16.

- [ ] A Rust test as the outcome describes, built from the frozen `remote-sync.0.19.0.json` and replica files laid down beside it, asserting: the record converted with nothing forgotten; the consent under `org:<id>` and `owner` empty; the session resumed with no password; each replica file's bytes or identity unchanged by the launch (no pull replaced it); an owner-only act reaching the in-memory or loopback platform with that consent.
- [ ] The full Rust suite, `cargo fmt --check` and clippy pass with no new warnings.

## Relevant areas

- `apps/desktop/tauri/src/organization/session/command.rs` (`state_of`, the launch cell), `machine/record.rs`, `upgrade/consent.rs`, the frozen fixture
