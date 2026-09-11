---
status: resolved
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

- [x] Creating a workspace provisions a database through ticket 05's port, applies
      `@rentable/workspace-migrations` to it, and writes a signed `workspace` row. Two workspaces
      of one organization exist and both open.
      *Verified: `organization/workspace.rs::create_workspace` creates the database through the port
      (protected inside the create), mints a `30m` credential for the migration and applies the
      shipped schema through `organization/migrate.rs`, which `build.rs` now embeds in the binary in
      `drizzle-kit`'s order and posts as one `/v2/pipeline` request, then mints the owner's credential
      and writes a signed `workspace` row and a signed `grant` row.
      `an_owner_creates_a_workspace_migrated_recorded_signed_and_granted` pins every step against the
      fake port and a scripted pipeline; `two_workspaces_of_one_organization_exist_and_both_open`
      creates two, reads both back verified, and opens a replica of each with the credential the
      owner's session holds. `the_embedded_migrations_are_the_shipped_files_in_order` holds the
      embedded set to the mirrored directory, and the live run below applied it to a real database.*
- [x] A grant is a credential sealed to the member's X25519 public key, which is what lets an
      administrator grant a workspace to a member whose password they do not know. **A member
      added to a second workspace after joining is a test**, because it is the property the whole
      asymmetric design exists for and a symmetric shortcut would pass every other test here.
      *Verified: `grant_workspace` seals the credential to the member's `vault.public_key` with
      `seal_to_public_key`, and a member's sign-in unseals every grant with the secret their password
      opened. **The property is a test**:
      `a_member_is_added_to_a_second_workspace_after_joining_without_their_password` writes a member,
      grants them the first workspace, signs them in and finds one credential, then creates a second
      workspace and grants it with nothing but their public key on hand, signs them in again and
      finds two, the second being the owner's own credential re-sealed, with no mint made for the
      member. A symmetric shortcut has no way to pass it.*
- [x] Live, admitted by ticket 01: a `read-only` grant's write is refused **by Turso**, and an
      administrator's attempt to delete a workspace database is refused for want of authority
      rather than for want of a button.
      *Verified: 2026-09-11, asked for first.
      `workspace_live_a_read_only_credential_is_refused_by_turso_and_a_full_one_is_not` provisioned
      `t819-14-18d45efc9d0474b0` in `rentable`, applied the shipped schema over the wire, minted a
      read-only and a full-access credential, opened a replica with each, inserted a `complex` row on
      each and pushed. Turso refused the read-only push with `BLOCKED: SQL write operations are
      forbidden (current session doesn't have write permission)` and accepted the full-access one; the
      database was deleted by the same run, which printed `ok`. The other half, an administrator's
      delete refused for want of authority, needs no live account: `workspace_delete` refuses before any
      request on a machine without the platform authority, and
      `anybody_but_the_owner_is_refused_a_create_and_a_delete_before_any_request` performs it.*
- [x] Only an owner creates or destroys a workspace, and the refusal for anybody else is at the
      command. Requirement 11 records that this is forced rather than chosen: creating a database
      needs the platform authority requirement 5 keeps on the owner's machine and out of every
      database.
      *Verified: `create_workspace` and `delete_workspace` refuse any session whose role is not `owner`
      with `Forbidden` saying to ask the owner, before any request, and the commands refuse first on
      the authority: `owner_platform` is `None` on any machine without the consent token, so the
      refusal is forced by requirement 5 rather than chosen. The test above asserts a member's create
      makes no request and a member's delete deletes nothing. `permission.rs` carries the package's
      six acts and role masks, held to `packages/workspace-permission/index.ts` by a test that reads
      the package's source, and `every_act_is_granted_or_withheld_by_role` is criterion 12's table.*
- [x] Deleting a workspace is the one moment requirement 4 permits deletion, and it goes through
      the explicit intent ticket 05 requires. Nothing else in the tree can reach deletion.
      *Verified: `delete_workspace` calls the port with `DeletionIntent::WorkspaceDeletedByHuman`, the
      port lifts the protection and deletes, and `OrganizationStore::delete_workspace` removes the row
      and its grants; `deleting_a_workspace_is_the_human_intent_and_removes_the_rows` pins the intent
      and the rows. The only other deletion in the organization is a create that could not finish,
      under `CreatedAndUnreferenced`, which `a_create_whose_migration_fails_removes_the_database_it_made`
      covers; nothing else in the tree constructs an intent.*
- [x] A credential has an expiry and is renewed while the member still holds the grant. What
      happens when it lapses is what ticket 15's ordinary removal relies on, so the renewal path is
      built here rather than assumed.
      *Verified: every credential is minted with `WORKSPACE_CREDENTIAL_LIFETIME = "4w"` and its `exp` is
      recorded on the grant as `credential_expires_at`. `renew_credentials` mints one fresh credential
      per database and level and re-seals it to every member who still holds a grant, moving the
      owner's own with the rows; a member with no grant row gets nothing, which is what an ordinary
      removal is. `renewal_reseals_every_standing_grant_from_one_mint_per_database_and_level` pins
      three grants renewed from two mints and the member's next sign-in holding the same fresh
      credential the owner does. `organization_renew_credentials` is the command; scheduling it is
      ticket 15's, which takes the credential and its renewal.*
- [x] Both locales, both directions.
      *Verified: `layout.noWorkspace.*` gained five keys in `en` and `ar`; the no-workspace surface draws the
      create form for the owner and the owner-only sentence for everybody else, and
      `startup-sign-in.svelte.test.ts` renders both in English and in Arabic.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `pnpm check` 0 errors over 9221 files; root `pnpm lint` clean; `pnpm test` 890 node tests
      and 17 component tests; `vite build` builds; `cargo test` single-threaded
      `311 passed; 0 failed; 8 ignored`; `cargo clippy --all-targets` the same five pre-existing
      warnings; `cargo fmt --check` clean.*

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

**Recorded while building, 2026-09-11.** A full-access grant is the granter's own credential
re-sealed, so an administrator grants what they can reach themselves; a read-only grant is minted,
which is the owner's, because minting needs the platform authority. Opening a workspace at startup
is `workspace_open` followed by the existing bootstrap: the command records the workspace as this
machine's current one and holds the unsealed credential, and `open_database` takes that in place of
the control-plane mint. The rest of the control-plane path stands untouched until ticket 19.
