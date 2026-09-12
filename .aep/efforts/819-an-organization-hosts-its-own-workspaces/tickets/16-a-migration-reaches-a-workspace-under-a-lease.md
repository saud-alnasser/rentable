---
status: resolved
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

- [x] `apps/desktop/tauri/src/database/test/workspace.rs::apply_schema_remotely` is promoted out of
      `#[cfg(test)]` into shipping code rather than written again. It already posts to
      `https://{host}/v2/pipeline`, which is the wire path a migration needs, and a sync connection
      cannot carry `0003`'s drops and renames (measured 2026-08-20 by #552).
      *Verified: `organization/migrate.rs` is the promotion, made in ticket 14 for the create and
      extended here with `statements_between` and `apply_between` for the tail a pending workspace
      needs; `apply_schema_remotely` no longer posts anything itself and calls
      `migrate::apply` through `Pipeline::of(host)`, so the runner the live tests rely on is the
      runner the application ships.
      `the_statements_between_two_versions_are_the_tail_and_nothing_before_it` holds the tail to the
      whole.*
- [x] A client that finds a pending migration takes the `migration_lease` row for that workspace
      with a deadline, applies the migration, records the new `schema_version`, and releases the
      lease. Two clients racing for the same lease is a test, not an assumption.
      *Verified: `organization/migration.rs::upgrade` takes the lease through a `LeaseAuthority`,
      applies `apply_between(current, shipped)` over the member's own full-access credential,
      records the version through the unsigned `store::record_schema_version` (the plan keeps the
      version outside the signature so any member can write it), pushes, and releases. The lease
      is taken where it is atomic: `PipelineLease` posts one conditional upsert and a read of the
      row to the organization database's primary under the member's organization credential, and
      the row's holder is the answer; `StoreLease` runs the same statements against a local
      primary. `two_clients_racing_for_the_lease_and_a_leaked_lease_that_expires` has two members
      race, one held and the other told who holds it and until when, then the holder release and
      the other take it; `a_pending_migration_is_applied_under_the_lease_and_recorded` drives the
      whole path against a scripted pipeline and asserts the request carries exactly the last
      migration's statements under the member's credential, the version recorded, and the lease
      gone; `the_pipeline_lease_reads_the_holder_out_of_the_answer` pins the production authority's
      request and its reading of the database's answer.*
- [x] **A leaked lease expires.** A client that takes a lease and dies leaves a workspace
      unupgradable only until the deadline passes, and the deadline is a value a human can read out
      of the row.
      *Verified: the row's `expires_at` is the moment the lease was taken plus
      `MIGRATION_LEASE_LIFETIME_MS` (thirty minutes, the control plane's migration credential
      lifetime), a millisecond timestamp readable out of the row and shown to a waiting member as a
      time; the upsert takes a row whose deadline is at or before `now`. The race test reads the
      deadline off the row, has a take before the deadline refused and one at the deadline held
      with the holder gone, and `a_client_waits_on_anothers_lease_and_a_failure_releases_it` has a
      failed migration release the lease so nobody waits out a deadline on a dead client.*
- [x] **A build older than a workspace's schema refuses to open it and says so**, offering nothing
      else. A test opens a migrated workspace with the previous schema version and asserts nothing
      is read.
      *Verified: `migration::refuse_newer` refuses a workspace recorded above `shipped_version()`
      with both numbers and "update rentable", and `workspace_open` calls it right after
      `openable`, before the workspace is recorded as current, before the replica is opened, and
      before anything of it is read; it is a function of the facts alone.
      `a_build_older_than_the_workspace_refuses_to_open_it_and_reads_nothing` records a workspace
      one above what this build ships and asserts the refusal names `schema N+1`, `knows N`, and
      what to do, and that it is not read as pending.*
- [x] A member watching a migration run sees that it is running rather than seeing the application
      appear stuck. It is the one moment the local replica is not enough.
      *Verified: `upgrade` reports `MigrationPhase::{Applying, Waiting, Done}` and the command
      emits each as the `organization:migration` event; the shell records it in
      `layout/migration-notice.svelte.ts` and the loading screen draws a sentence under the stage,
      applying or waiting on another member until their deadline, in both locales.
      `startup-loading.svelte.test.ts` renders the three cases. The phases are asserted in order by
      the two upgrade tests.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` clean; `pnpm test`
      911 node tests and 44 component tests pass; `vite build` builds. `cargo test
      --test-threads=1` 337 passed, 0 failed, 9 ignored; `cargo clippy --all-targets` the same five
      warnings that stand at the branch point; `cargo fmt --check` clean.*

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
