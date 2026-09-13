---
status: resolved
blocked-by: [09]
---

# feat(organization): a machine holds one organization

## Outcome

`remote-sync.json` records one organization or none, connected by the organization's link
without opening a vault, forgotten by a disconnect that leaves nothing of it on this machine,
and forgotten at startup where the machine holds the shape built before this effort.

## Acceptance Criteria

Traces requirement 17, requirement 18 and requirement 20 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 17, criterion 18 (the Rust half) and criterion 20 (the Rust half).

- [x] `RemoteSyncStore.organization: Option<HeldOrganization>` replaces `organizations`, with
      `member_id: Option<String>` and `role: Option<String>`; `OrganizationState` and `host.ts`
      carry `organization: HeldOrganization | null`; every reader in Rust and in the frontend
      compiles against it. *Verified 2026-09-13 on the effort branch: `svelte-check` 9279 files 0 errors; `cargo test` 293 passed; `host.ts` carries `organization: HeldOrganization | null` and `grep` finds no `organizations` reader in either tree.*
- [x] `organization_connect(link)` decodes the link, reaches the replica as `inspect` does, writes
      the record with no member, opens no vault, and returns the state; it refuses while an
      organization is held. Asserted in Rust against a store with one member. *Verified: `cargo test` on the effort branch includes `connect::tests::connecting_by_the_link_records_the_organization_and_no_member` and `a_link_whose_key_or_id_the_rows_do_not_carry_is_refused_and_nothing_is_recorded`, both ok.*
- [x] `organization::forget` closes and deletes every `org-*.db*` and `ws-*.db*` under the data
      directory, resets `organization`, `replicas` and `workspace`, clears the Turso authority, and
      commits; `organization_disconnect` calls it after signing out. Asserted on a temporary data
      directory holding one organization and two workspace replicas, the keyring behind a fake. *Verified: the same run, `forget::tests::forgetting_leaves_no_replica_no_record_and_no_authority` ok on Windows, over a temporary directory with the organization replica open and two workspace replicas, the keyring behind the consent tests' store.*
- [x] The first `organization_state_get` of a launch forgets a record whose JSON still carries a
      non-empty `organizations` array, and a held organization whose replica has no
      `member.username_sealed` column or no replica file at all, and writes a diagnostic saying
      so. Asserted with a record of two and with a replica of the old schema. *Verified: the same run, `a_record_listing_organizations_is_forgotten_at_startup` and `a_replica_of_the_old_schema_or_none_at_all_is_forgotten_at_startup` ok; the diagnostic is `organization.forgotten.oldShape`.*
- [x] `cargo test` and `pnpm check` pass. *Verified on the effort branch: `cargo test` 293 passed, 10 ignored; `svelte-check` 9279 files 0 errors; node:test 906 pass; vitest 88 passed in 12 files; prettier clean; eslint 0.*

## Relevant areas

`apps/desktop/tauri/src/sync/store.rs`, `apps/desktop/tauri/src/organization/{mod,command,join}.rs`,
`sync/turso/consent.rs` (`disconnect`), `apps/desktop/src/lib/platform/host.ts`, `sync/admission.ts`.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *One organization on a machine*, and the two technical risks on deleting an open
  replica and on the startup check.**
- **The frontend's one confirm is ticket 13's and 14's**; the command asks nothing.
- **A changeset rides with the change.**

## Notes

Landed 2026-09-13. What a later reader needs, each inside the plan's bounds:

- **`organization_disconnect` was already a command name**, the consent's own disconnect in
  `sync/command.rs`, which the setup walk's `consent.disconnect` procedure reached through
  `host.organization.disconnect`. That command is now `organization_consent_disconnect` and the
  host port `consentDisconnect`, beside `consentBegin` and `consentResult`; the router procedure
  `consent.disconnect` and the walk are unchanged. The name the plan gives the forget belongs to
  the forget: `organization_disconnect` returns the state, and `host.organization.disconnect`
  with it. `host.organization.connect(link)` sits beside it. Both are router procedures
  (`connect`, `disconnect`, public) and nothing on a screen calls either yet; `startup-ports.ts`
  is untouched until tickets 13 and 14 wire them.
- **The old shape's list stays on the record until the check has read it.**
  `RemoteSyncStore.organizations_of_the_old_shape` is the `organizations` key, read as raw JSON
  values and written back while non-empty (`skip_serializing_if`), because `RemoteSync::new`'s
  `reconcile` commits on a first launch and a field dropped on read would have erased the one
  sign before `organization_state_get` ran. `forget_organization` clears it, and a record of the
  new shape never carries the key (`sync/store.rs` test).
- **The check runs once per launch through `AppState.old_shape_check`**, a `tokio::sync::OnceCell`
  that `state_of` in `command.rs` initialises; every command that answers with the state goes
  through `state_of`, so the check is made before any of them. A check that failed leaves the
  cell empty and the next read tries again. The three signs and their sentences are
  `forget::OldShape`, returned by `forget_old_shape` so a test reads the reason the diagnostic
  (`organization.forgotten.oldShape`) carries.
- **`forget` empties `turso_organization` as well** as the three fields the plan names, since
  the spec's requirement 20 says the record is emptied and the slug is a fact about a consent
  the same call clears; `organization_reconnect_authority` and the walk both rediscover it. It
  also drops the in-memory workspace credential and both refusals. It leaves the workspace
  engine released (`db.disconnect()` and no reconnect), which is the state a launch is in before
  the wall on a machine that holds nothing; the frontend after a disconnect goes to the nothing
  screen and does not call `bootstrap` (ticket 13 and 14). The sweep is by name, every
  `org-*.db*` and `ws-*.db*` under the data directory, and a file that will not go is named in
  an `Io` error after the record and the authority are already cleared.
- **`sign_in` refuses a record with no member** (`PreconditionFailed`, "holds ... and no member
  in it yet") until ticket 11 replaces it with the username lookup; `organization_sign_in` keeps
  its `(organization_id, password)` signature and refuses an id the machine does not hold.
  `join` and `restore` write `HeldOrganization` with `Some` member and role and replace the
  record rather than pushing to a list. `create_organization` writes the owner the same way.
- **`connect` verifies the organization row alone**, its id and its `verifying_key` column
  against the link's, as the plan says; the signed chain is verified at sign-in as it always was.
  It refuses through `connect::refuse_while_held`, which the command also calls before decoding
  the link so a held machine never reaches the network.
- **The wall still takes `organizations: HeldOrganization[]`**; `+layout.svelte` wraps the one
  held organization in a list, and `roleLabel` reads a `null` role as nothing. The select over
  several and its test stay until ticket 14 redraws the wall around the one. 819's session test
  for two organizations on one machine became a test over two stores, since the record cannot
  hold two.
- **A test builds the whole `AppState`** (`forget.rs`, `state_over`) over a scratch directory,
  the way `lib.rs` does, with the keyring behind `consent.rs`'s test store and its turn taken;
  a later ticket that needs a command's whole path can copy it.
- **Building here.** `CARGO_TARGET_DIR` pointed at the session scratchpad, as ticket 09 noted;
  clippy's five warnings are the same five pre-existing ones outside the organization module.
