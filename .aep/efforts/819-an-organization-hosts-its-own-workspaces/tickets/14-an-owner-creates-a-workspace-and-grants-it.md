---
status: open
blocked-by: ['10']
---

# feat(organization): an owner creates a workspace and grants it

## Outcome

An owner creates a workspace: a database on the customer's account, migrated to the current schema,
recorded as a signed row, and granted to members as credentials sealed to their public keys. A
member opens a workspace their vault holds a grant for. An organization holds several workspaces
and a read-only member's write is refused by Turso rather than by the interface.

## Acceptance Criteria

Traces requirement 1, requirement 11 and requirement 21 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 1, criterion 11
and criterion 21.

- [ ] Creating a workspace provisions a database through ticket 05's port, applies
      `@rentable/workspace-migrations` to it, and writes a signed `workspace` row. Two workspaces
      of one organization exist and both open.
- [ ] A grant is a credential sealed to the member's X25519 public key, which is what lets an
      administrator grant a workspace to a member whose password they do not know. **A member
      added to a second workspace after joining is a test**, because it is the property the whole
      asymmetric design exists for and a symmetric shortcut would pass every other test here.
- [ ] Live, admitted by ticket 01: a `read-only` grant's write is refused **by Turso**, and an
      administrator's attempt to delete a workspace database is refused for want of authority
      rather than for want of a button.
- [ ] Only an owner creates or destroys a workspace, and the refusal for anybody else is at the
      command. Requirement 11 records that this is forced rather than chosen: creating a database
      needs the platform authority requirement 5 keeps on the owner's machine and out of every
      database.
- [ ] Deleting a workspace is the one moment requirement 4 permits deletion, and it goes through
      the explicit intent ticket 05 requires. Nothing else in the tree can reach deletion.
- [ ] A credential has an expiry and is renewed while the member still holds the grant. What
      happens when it lapses is what ticket 15's ordinary removal relies on, so the renewal path is
      built here rather than assumed.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Relevant areas

`apps/control-plane/src/workspace/migration.ts` is the model: `migrateWorkspaceDatabase(client,
upTo, {database})` wrapping `oneAtATime`, `versionOfWorkspaceDatabase(client)`, and
`MIGRATION_TOKEN_LIFETIME = '30m'` for the credential the migration itself spends. Applying a
migration to an existing workspace is ticket 16; creating one already migrated is this ticket.

`packages/workspace-migrations` is unchanged and already carries the SQL for both callers.

`apps/desktop/tauri/src/database/mod.rs::Engine::Workspace` is how a workspace is opened today, and
what changes is where its credential comes from: a grant the vault unsealed rather than a control
plane response.

## Constraints

- **[[references/turso]], *Never run*.** The live half creates and removes only what it created. Do
  not touch `control-plane` or `control-plane-live-test`. Ask before running it.
- **[[rules/credentials]], *Client boundary*.** A workspace credential is unsealed in Rust, spent
  in Rust, and never returned to TypeScript.
- **The workspace's data model is untouched.** Contracts, payments, tenants, units and every
  derived status are out of scope by the spec's own exclusion. This changes where a workspace lives
  and who may open it, and nothing about what is in it.

## Notes

Gated on ticket 10 rather than on the dashboard, because creating a workspace is the owner's and
the owner is signed in as soon as ticket 10 lands. It can therefore proceed in parallel with
tickets 11 to 13.

Three tickets depend on this one and each takes a different piece of it: 15 takes the credential and
its renewal, 16 takes the schema version, and 17 takes what happens when the account refuses.
