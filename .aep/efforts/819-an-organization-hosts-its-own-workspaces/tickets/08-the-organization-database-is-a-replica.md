---
status: resolved
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

- [x] The seven tables exist with the columns the plan lists, and a workspace names an organization.
      Two workspaces of one organization exist at once and nothing constrains an account to one,
      which is what `workspace.ownerAccountId` being `.unique()` prevented.
      *Verified: `organization/store.rs` creates the seven tables of the plan's data model as `SCHEMA`, and
      `TABLES` names them; `the_seven_tables_exist_and_an_organization_holds_two_workspaces_at_once`
      compares `TABLES` against `sqlite_master`, writes two workspaces into one organization and reads
      both back verified, and reads `PRAGMA table_info(workspace)` to assert no column names an owner.
      A workspace names its organization by living in that organization's database, which is the one
      the row is in; there is no account to constrain. One column the plan lists is deliberately absent:
      `member.email_local_hint`, which the plan's own paragraph beneath the schema calls a locally-stored
      convenience rather than a column, and which in the database would be an address in the clear
      against criterion 15. Recorded in the run log rather than edited into the plan.*
- [x] A boundary test over the organization schema fails if a rents domain table appears in it, in
      the shape `apps/control-plane/src/tests/boundary.test.ts` already has for the control plane.
      **The organization database and a workspace database are never one database**, and the spec
      settles why under requirement 2.
      *Verified: `no_rents_domain_table_and_no_session_table_appears_in_the_organization_schema` reads every
      `CREATE TABLE` out of the shipped workspace migrations, seven concepts, and fails if any of them
      is among the organization's tables, in the shape the control plane's boundary test has: the list
      is read rather than written down, so an eighth concept arrives in the test on its own. It also
      asserts `session` is absent, which is requirement 18. The two databases are two files by
      construction: `OrganizationStore::replica_path` is `org-<id>.db` and a test asserts it differs from
      `Database::replica_path` for the same id.*
- [x] Given only what an invite link carries and a `read-only` credential, no email address, display
      name, or workspace name is readable from a populated organization database. A test asserts
      this against real rows rather than against an empty table.
      *Verified: `a_link_holder_reads_no_email_no_display_name_and_no_workspace_name` populates two members,
      two workspaces and an organization row, then reads every text and blob cell of every table through
      the raw connection, as a read-only credential would, and asserts neither address, neither name,
      neither workspace name nor the organization's name appears in any of the 60-odd cells. It then
      reads the verified rows and shows a content key the link does not carry opens nothing, while the
      organization's does. `vault.rs` gained the content key for it: `ContentKey`,
      `generate_content_key`, `seal_content` and `open_content`, with the column name bound as
      associated data so a ciphertext moved between columns does not open, and two vault tests cover
      the key and its travel to a member as a sealed box.*
- [x] Every write through this module signs what ticket 07 says is signed, and every read verifies
      it. A row that fails verification is refused rather than logged and used.
      *Verified: `write_member`, `write_workspace` and `write_grant` each call `authority::sign` over the
      fields ticket 07 names, and `members`, `workspaces` and `grants` each pass every row through
      `verified`, which finds the certificate and calls `authority::verify`; there is no read path
      without it. `what_was_written_signed_is_read_back_verified` reads everything back.
      `a_row_another_member_altered_is_refused_on_read_and_named` performs criterion 16's write through
      the raw connection and asserts the read is refused naming `member-staff`.
      `a_row_signed_under_a_revoked_or_unknown_certificate_is_refused` covers a revoked certificate and
      one nobody issued, and `a_database_signed_under_another_key_verifies_for_nobody_holding_the_real_one`
      covers a database rewritten under another organization key. A refusal is an `Integrity` error
      that ends the read, not a row dropped and the rest used.*
- [x] **Two synced databases are open at once and it is proved rather than assumed.** The plan
      records this as an untested capability of `turso` 0.8.0-pre.7 that would first appear as a
      hang on turso's IO thread, the same shape `install_crypto_provider` guards. A test opens the
      organization replica and a workspace replica together and does work on both.
      *Verified: `the_organization_replica_and_a_workspace_replica_are_open_at_once` opens the organization
      store and a workspace replica through `Database::open_replica` in one process, with no remote as
      the application runs offline, interleaves writes and reads on both, and reads both back. The live
      test below did the same with two engines against real remotes. Neither hung. `AppState` gained
      `organization: Arc<RwLock<Option<OrganizationStore>>>` beside `db`, `None` until sign-in.*
- [x] Live, admitted by ticket 01: machine A writes, machine B reads it back, against a database
      this run provisions and removes.
      *Verified: 2026-09-11, asked for first and the database named beforehand.
      `organization_live_a_second_machine_reads_what_the_first_wrote` provisioned
      `t819-08-18d4538af90c43f0` in group `rentable` through `PlatformApi`, minted a `1h` token, opened
      replica A, installed the schema over the sync connection, wrote the populated organization and
      pushed; opened replica B in a second directory, pulled, read two members and two workspaces
      verified against the pinned key, and opened a sealed display name; then deleted the database as
      `CreatedAndUnreferenced`. It printed `ok`. The account holds nothing the run made.*
- [x] `cargo test`, `cargo clippy` and the repository's gates pass.
      *Verified: `cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml -- --test-threads=1` gives
      `275 passed; 0 failed; 7 ignored`, eleven of them new and the seventh ignored the live test above.
      `cargo clippy --all-targets` gives the same five warnings that stand at the branch point, none in
      this diff. `cargo fmt --check` is clean.*

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
