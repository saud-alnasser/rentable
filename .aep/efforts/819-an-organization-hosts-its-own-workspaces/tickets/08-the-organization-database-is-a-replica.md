---
status: open
blocked-by: ['05', '06', '07']
---

# feat(organization): the organization database is a replica

## Outcome

`organization/store.rs` holds the organization database's schema and the queries over it, and the
desktop opens it as a second `turso::sync::Database` beside the workspace engine. What the control
plane's four tables knew now lives on the customer's account, sealed and signed, and a second
machine reads what the first wrote.

## Acceptance Criteria

Traces requirement 1, requirement 2 and requirement 15 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 1, criterion 2 and
criterion 15. The schema is given in
[[efforts/819-an-organization-hosts-its-own-workspaces/plan]] under *Data model* and is not
restated here.

- [ ] The seven tables exist with the columns the plan lists, and a workspace names an organization.
      Two workspaces of one organization exist at once and nothing constrains an account to one,
      which is what `workspace.ownerAccountId` being `.unique()` prevented.
- [ ] A boundary test over the organization schema fails if a rents domain table appears in it, in
      the shape `apps/control-plane/src/tests/boundary.test.ts` already has for the control plane.
      **The organization database and a workspace database are never one database**, and the spec
      settles why under requirement 2.
- [ ] Given only what an invite link carries and a `read-only` credential, no email address, display
      name, or workspace name is readable from a populated organization database. A test asserts
      this against real rows rather than against an empty table.
- [ ] Every write through this module signs what ticket 07 says is signed, and every read verifies
      it. A row that fails verification is refused rather than logged and used.
- [ ] **Two synced databases are open at once and it is proved rather than assumed.** The plan
      records this as an untested capability of `turso` 0.8.0-pre.7 that would first appear as a
      hang on turso's IO thread, the same shape `install_crypto_provider` guards. A test opens the
      organization replica and a workspace replica together and does work on both.
- [ ] Live, admitted by ticket 01: machine A writes, machine B reads it back, against a database
      this run provisions and removes.
- [ ] `cargo test`, `cargo clippy` and the repository's gates pass.

## Relevant areas

`apps/control-plane/src/database/schema.ts` is what this replaces: `account`, `workspace` with its
`.unique()` owner and its `schemaVersion`, `membership` with its role and permissions and composite
key, and `session` with its two expiries. Read it for what was learned, not for what to copy; the
session table has no successor here, because requirement 18 removes the window it existed for.

`apps/desktop/tauri/src/database/mod.rs` holds `Engine` and the `turso::sync::Builder` call:
`new_remote(path).bootstrap_if_empty(false).with_auth_token_fn(auth_token)`. **A third `Engine` arm
is not added.** The plan is explicit: `Engine` answers what the workspace is open as, and an
organization is not a workspace, so the organization replica is a second `Database` held beside it.

`crate::http::install_crypto_provider` is called before the sync builder for a reason recorded in
that file.

## Constraints

- **[[references/turso]], *Never run*.** The live half creates and removes its own database and
  touches nothing else.
- **[[rules/credentials]], *Client boundary*.** The credential that opens this replica stays in
  Rust, as the workspace credential already does.
- **Nothing here decides who may sign in.** That is ticket 10. This ticket stands the database up
  and proves it replicates.

## Notes

The three edges are real and none is convenience: the schema's sealed columns are shaped by ticket
06, its signature columns by ticket 07, and standing a replica up at all needs a database, which is
ticket 05.

`session` having no successor is worth saying out loud in review. It is the table whose absence is
requirement 18, and somebody porting the schema faithfully will re-add it.
