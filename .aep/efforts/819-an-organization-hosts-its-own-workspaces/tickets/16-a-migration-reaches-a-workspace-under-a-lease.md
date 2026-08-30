---
status: open
blocked-by: ['14']
---

# feat(organization): a migration reaches a workspace under a lease

## Outcome

Whichever client notices a pending migration takes a lease with a deadline and applies it over the
wire, so no machine is special and an organization whose owner is away still upgrades. A build
older than a workspace's schema refuses to open it and says why, rather than reading rows it was
not written against.

## Acceptance Criteria

Traces requirement 20 and requirement 24 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 24.

- [ ] `apps/desktop/tauri/src/database/test/workspace.rs::apply_schema_remotely` is promoted out of
      `#[cfg(test)]` into shipping code rather than written again. It already posts to
      `https://{host}/v2/pipeline`, which is the wire path a migration needs, and a sync connection
      cannot carry `0003`'s drops and renames (measured 2026-08-20 by #552).
- [ ] A client that finds a pending migration takes the `migration_lease` row for that workspace
      with a deadline, applies the migration, records the new `schema_version`, and releases the
      lease. Two clients racing for the same lease is a test, not an assumption.
- [ ] **A leaked lease expires.** A client that takes a lease and dies leaves a workspace
      unupgradable only until the deadline passes, and the deadline is a value a human can read out
      of the row.
- [ ] **A build older than a workspace's schema refuses to open it and says so**, offering nothing
      else. A test opens a migrated workspace with the previous schema version and asserts nothing
      is read.
- [ ] A member watching a migration run sees that it is running rather than seeing the application
      appear stuck. It is the one moment the local replica is not enough.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Relevant areas

`apps/desktop/tauri/src/database/test/workspace.rs` holds `apply_schema_remotely`, which is the
whole reason this is a promotion rather than new code.

`apps/control-plane/src/workspace/migration.ts` is the semantics being moved:
`migrateWorkspaceDatabase(client, upTo, {database})` wrapping `oneAtATime(database, ...)`,
`versionOfWorkspaceDatabase(client)`, and `MIGRATION_TOKEN_LIFETIME = '30m'`. `oneAtATime` is the
control plane's answer to the same race this lease answers, and it is worth reading before
inventing a second one.

`packages/workspace-migrations` is unchanged and is consumed by the desktop as well as by the
control plane, which it was already built for.

`organization/store.rs` from ticket 08 holds `migration_lease(workspace_id, holder_member_id,
expires_at)` and `workspace.schema_version`.

## Constraints

- **Any member may hold the lease.** The alternatives were rejected in the plan: owner-only makes
  every member wait for the owner to launch the application, and on a small team that is days of
  everybody blocked. Do not quietly narrow it to the owner because that is easier to reason about.
- **A migration is not applied to a workspace nobody is opening.** The trigger is a client noticing
  on open, not a background sweep across every workspace in the organization.
- **[[references/turso]], *Never run*.** A live exercise of this creates and removes its own
  database.

## Notes

Requirement 24's refusal is the half that protects data and it is cheap; the lease is the half that
is interesting and can race. Reviewing them together is fine, but if the lease turns out to need
more than one context, the refusal is the part that can be split off and landed first, because it
is what stops an older build reading a newer schema and that is the actual harm.
