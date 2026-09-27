---
status: open
blocked-by: [27]
---

# feat(organization): a copy is taken before a workspace migration

## Outcome

The human's call, 2026-09-27: the workspaces as well as the organization. A pending workspace
migration drops and renames tables on the database every member reads, and a migration that
finishes wrong has nothing to go back to. After this, the member holding the workspace's lease
copies the workspace, read over the pipeline the migration goes over, to a file of its own before
the first statement, and makes a protected copy on the owner's Turso account where this machine
holds it. A local copy that cannot be written releases the lease, refuses, and applies nothing.

## Acceptance Criteria

Traces requirement 13 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] `backup.rs` reads a workspace through `migrate::Pipeline` as its second source, and
      `migration::upgrade` takes the copy once the lease is held and before `apply_between`,
      labelled with the two versions.
- [ ] A test applies a pending migration against the pipeline test double and finds a local copy
      holding the workspace as it was before, and the protected copy where the account is held.
- [ ] A local copy that cannot be written releases the lease and refuses with `CopyNotTaken`, and
      nothing is applied. A test covers it.
- [ ] A remote copy the account refuses is logged and the migration goes on. A test covers it.
- [ ] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/backup.rs`, `tauri/src/organization/migration.rs`, `migrate.rs`, the callers of
  `migration::upgrade` in `session.rs` or `command.rs`
