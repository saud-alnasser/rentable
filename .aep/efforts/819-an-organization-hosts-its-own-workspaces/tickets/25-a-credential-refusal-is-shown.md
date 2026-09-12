---
status: open
blocked-by: []
---

# fix(desktop): a credential refusal is shown rather than read as synced

## Outcome

When a replication is refused for the credential rather than the account, the member sees that
something needs attention instead of "synced" (F5), so a lapsed credential, a lock-out, or a
read-only member's refused write is visible rather than silent.

## Background

`ReplicationRefusal::Credential` crosses to TypeScript on `RemoteSyncState` and no code reads it;
`syncStatusOf` returns `synced` while nothing replicates. Requirement 11 says the refusal comes from
Turso; today it does and reaches nobody.

## Acceptance Criteria

Traces requirement 11 and requirement 25 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 11 and criterion 25.

- [ ] **A credential refusal produces a distinct sync status**, separate from an account refusal and
      from synced, and the workspace sync surface says the credential needs renewing or reconnecting
      rather than showing nothing wrong. A test over `syncStatusOf` covers the credential case.
- [ ] The status is drawn in both locales.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Constraints

- A changeset is not written, for the reason ticket 23 gives.
