---
status: open
blocked-by: []
---

# fix(organization): the organization's own link can be read again

## Outcome

An owner can read their organization's own join link after setup, not only in the one moment it is
shown (F7), so an owner whose first machine is gone and who kept no link can still restore.

## Background

The organization's own link is rendered once at `setup-walk.svelte` and never again; there is no
command to re-read it. Requirement 6's restore depends on holding that link, so a link shown once and
never recoverable is a way to lose the organization.

## Acceptance Criteria

Traces requirement 6 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its
criterion 6.

- [ ] **The owner can read the organization's own link from inside the application at any time**, on
      a surface an owner reaches, in both locales. A command returns it and a test covers the
      command refusing a non-owner and returning the link to the owner.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Constraints

- The link carries a read-only credential (requirement 8); showing it again is the same exposure as
  showing it once, to the owner who already holds it. It is not shown to a member.
- A changeset is not written, for the reason ticket 23 gives.
