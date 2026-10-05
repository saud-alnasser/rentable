---
status: open
blocked-by: [04, 05]
---

# refactor(turso): each organization keeps its own Turso consent

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*Each organization keeps its own Turso consent*).

## Outcome

The Turso consent token lives under `org:<organization id>` in the keyring, `owner` is only the pending slot a consent fills before an organization exists, and the existing `owner` token moves to its organization at the first launch on this build. Every owner-only act reaches the Platform API with its own organization's consent and Turso organization.

## Acceptance Criteria

Traces requirements 14 and 16, and criteria 14 and 16 (the keyring half).

- [ ] `store_platform_token` writes `owner`; `setup::finish`, `setup::connect` and `setup_reconnect_authority` move it to `org:<id>` (read, set, read back, delete) once the id is known; `platform_token`, `setup::authority`, `owner_platform` and `PlatformApi` take the organization id; `consented_organization` caches nothing across organizations; `abandon_the_consent` and `forget` delete only their own account.
- [ ] The once-per-launch cell in `state_of` moves an `owner` token to the one held organization that has a `turso_organization` and no `org:<id>` entry, after the old-shape check and before `resume_remembered`; a test pins that order.
- [ ] Criterion 16's test, extended: from the frozen fixture plus an `owner` token in the keyring, after load and the launch cell the token is under `org:<id>`, `owner` is empty, and an owner-only act reaches the in-memory platform.
- [ ] Criterion 14's test: two organizations on two Turso organizations; each owner-only act reaches the platform with its own token and slug; forgetting one leaves the other's token.
- [ ] `nothing_but_this_module_names_the_platform_token_service` is widened to the new account names and passes.

## Relevant areas

- `apps/desktop/tauri/src/turso/{consent.rs,platform/live.rs}`, `organization/act.rs`, `organization/setup/{mod.rs,command.rs,connect.rs}`
- `organization/session/command.rs` (`state_of`, the once-per-launch cell), `upgrade/plugin.rs`

## Constraints

- [[rules/credentials]]: the token is never printed or logged; the old account stays readable until moved.
- Ticket 04's minting keeps working through the move.
