---
status: resolved
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

- [x] **The owner can read the organization's own link from inside the application at any time**, on
      a surface an owner reaches, in both locales. A command returns it and a test covers the
      command refusing a non-owner and returning the link to the owner.
      *Verified: `invite::own_link` rebuilds the link from the stored rows, opening the sealed name
      and the sealed link credential with the content key, so it needs the open vault and not the
      Turso authority a restored owner lacks. `organization_own_link` delegates to it, refusing
      anyone but the owner. `the_organizations_own_link_is_the_owners_to_read_again` reads the link
      as the owner and decodes it to the same organization and verifying key the setup link named,
      no invitation half, a credential present, then invites a settled member and asserts they are
      refused with `Forbidden`. The owner's dashboard draws an `organization link` section
      (`organization-link.svelte`, `useOrganizationLink`) with the link and a copy button, in en
      and ar.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `svelte-check` 0 errors, `eslint` clean, node 894, vitest 45, `cargo test --
      --test-threads=1` 280 / 10 ignored, `cargo clippy --all-targets` at the five pre-existing
      warnings, `cargo fmt` clean.*

## Constraints

- The link carries a read-only credential (requirement 8); showing it again is the same exposure as
  showing it once, to the owner who already holds it. It is not shown to a member.
- A changeset is not written, for the reason ticket 23 gives.
