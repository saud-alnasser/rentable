---
status: resolved
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

- [x] **A credential refusal produces a distinct sync status**, separate from an account refusal and
      from synced, and the workspace sync surface says the credential needs renewing or reconnecting
      rather than showing nothing wrong. A test over `syncStatusOf` covers the credential case.
      *Verified: a persistent credential refusal is now recorded on the remote-sync store
      (`credential_refusal`, set in `sync/command.rs` when a reconnect does not settle the retry,
      cleared when a replication goes through) and crosses to the web layer on `RemoteSyncState`.
      `syncStatusOf` returns `credentialRefused`, read after `accountRefused` and before a fault,
      and `sync.svelte` draws a warning callout telling the member their access is being refreshed
      and to ask the owner if it does not clear.
      `sync-status.test.ts`'s new case asserts the status and that the account refusal still reads
      first. Node tests 894 pass.*
- [x] The status is drawn in both locales.
      *Verified: `workspace.syncStatusCredentialRefused` and `workspace.credentialRefused` are in
      `en` and `ar` and the hand-generated `i18n-types.ts`; `pnpm check` clean.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `svelte-check` 0 errors, `eslint` clean, node 894, vitest 45, `cargo test` 274 /
      10 ignored, `cargo clippy --all-targets` at the five pre-existing warnings, `cargo fmt`
      clean. `pnpm test` through turbo is the known worktree shim defect; run per package.*

## Constraints

- A changeset is not written, for the reason ticket 23 gives.
