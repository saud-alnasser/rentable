---
status: resolved
blocked-by: [05]
---

# feat(organization): the organization's name is signed by the owner

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The organization's signed name*).

## Outcome

The organization database has a signed `organization_name` table; the owner's machine signs the existing name at its next sign-in, resume or heartbeat; every machine reads the signed name where it verifies, falls back to today's unsigned name only until it has once seen a signed one, and refreshes its held name when the verified name differs.

## Acceptance Criteria

Traces requirements 26 and 29, and criteria 26 and 29.

- [x] `organization_name` is appended last to `TABLES`/`SCHEMA`, completed by `complete_schema`, with no format change; the table-count and format-three structure tests are updated.
- [x] `Authority::OrganizationName { name_sealed, updated_at }` with its own domain constant; `covers` answers `certificate.is_root()`; `needed_for` names the owner's certificate; preimage vectors added; re-signed in `re_sign_rows_of_certificates_but`, with a test that a handover leaves it valid.
- [x] Beside `repair_owner_row`, the owner's machine writes a signed row from the current `name_sealed` where none exists, and pushes.
- [x] `facts_of` reads the signed name where it verifies; where none exists and the entry's `name_signed` is false it falls back to `name_sealed`; reading a signed name sets `name_signed`; once set, a missing or forged row shows the held name.
- [x] `state_of` refreshes the selected entry's held name where the verified name differs.
- [x] Criterion 29's Rust test: a forged unsigned `name_sealed` written straight into a replica after a signed name was seen does not show; an organization made before this change still opens and names its name before the owner signs. Criterion 26's two-replica test: a member's held name follows after a sync while signed in, and a replica that has not synced keeps the old one.

## Relevant areas

- `apps/desktop/tauri/src/organization/{authority/preimage.rs,authority/mod.rs,authority/chain.rs,store/mod.rs,store/signature.rs,store/setup.rs,store/mark.rs,ownership/repair.rs,session/mod.rs,session/command.rs}`

## Constraints

- [[rules/migrations]]: no format bump; members on older builds keep opening the organization.
- The mark is the precedent for writing and reading a signed row; follow it.
