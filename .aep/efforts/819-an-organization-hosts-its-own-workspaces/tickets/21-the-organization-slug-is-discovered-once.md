---
status: resolved
blocked-by: ['20', '22']
---

# feat(sync): the organization slug is discovered once

## Outcome

`sync/turso/discovery.rs` turns a consented token into the organization slug every Platform API
path needs, by asking Turso's MCP server to list the group's databases and reading the slug out of
a hostname. It is the only module in the tree that speaks to `mcp.turso.ai`, and the slug it
returns is stored locally so nothing asks twice.

## Acceptance Criteria

Traces requirement 3 and requirement 22 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 3 and criterion 22.

- [x] The module completes an MCP `initialize` and one `tools/call` of `list_databases` over
      streamable HTTP against the resource the consent was granted for, and reads the reply. The
      shape is recorded in
      [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]].
      *Verified: `look_up_organization` posts `initialize` then `tools/call` of `list_databases` to
      `https://mcp.turso.ai/mcp`, protocol `2025-06-18`, and echoes the `mcp-session-id` the handshake
      returns. `one_lookup_reads_the_slug_and_the_group_out_of_the_listing` drives both against a
      scripted server, `the_session_the_handshake_opens_is_carried_into_the_call` asserts the header is
      carried, and `a_reply_framed_as_an_event_stream_is_read_the_same_way` covers the SSE framing the
      prototype measured. `the_token_is_sent_as_a_bearer_credential_and_nothing_else_is` asserts the
      credential appears in no other header and in no query parameter.*
- [x] **The slug is derived by removing the record's own `Name` from its `hostname`**, never by
      splitting on dashes. A hostname is `<name>-<slug>.<region>.turso.io` and both a database name
      and an organization slug may contain dashes, so the only unambiguous parse is the one that
      subtracts a value the same record supplies. A test covers a slug containing a dash and a
      database name containing several.
      *Verified: `slug_from_hostname` strips `.turso.io`, takes the first label, then strips the
      record's own `Name` and the dash after it. There is no `split('-')` anywhere in the module.
      `dashes_in_both_the_name_and_the_slug_are_not_a_parse_problem` is the criterion's own case, reading
      `rentable-co` out of `control-plane-live-test-rentable-co.aws-eu-west-1.turso.io` where the name
      carries three dashes and the slug one.
      `a_hostname_that_does_not_carry_the_name_yields_no_slug` covers the three ways the parse can find
      nothing, an empty remainder among them.*
- [x] **An empty group is not a failure.** Requirement 3 asks the customer to prepare an empty
      group, so the common first run has nothing to list. The module reports *no database yet*
      distinguishably, and the caller creates the first database and reads the slug from what comes
      back.
      *Verified: the return type is `OrganizationLookup::{Found, NoDatabaseYet}`, so the two answers
      cannot be confused at a call site. `an_empty_group_is_an_answer_rather_than_a_failure` asserts an
      empty listing returns `NoDatabaseYet` rather than an error, and
      `an_empty_group_is_not_remembered_as_an_answer` asserts nothing is written to the store, so the
      next run asks again instead of believing the account has no organization. Creating that first
      database is ticket 05's, and is deliberately not here.*
- [x] The slug is stored locally, beside the organizations this machine has joined, and is not a
      credential and not in the organization database. A test asserts a second provisioning call
      makes no MCP request.
      *Verified: `RemoteSyncStore` gained `turso_organization: Option<TursoOrganization>`, in
      `remote-sync.json` beside `replicas`, not in the keyring and not in the organization database. The
      field is additive under the store's existing `serde` defaults, so a file written before this change
      loads unchanged; `sanitize` drops a remembered organization whose slug is blank.
      `the_second_call_reads_the_store_and_makes_no_request` asserts the second `organization()` call
      leaves the scripted server's request count where the first left it, and then reopens the store from
      disk and finds the slug still there, which is what makes it storage rather than a cache.*
- [x] A refusal from the MCP server is distinguishable from a network failure and from an empty
      group, and its message names setup rather than sync. This is a first-run lookup and a
      customer who hits it has no workspace yet.
      *Verified: three answers, three shapes. `a_refusal_names_setting_up_rather_than_syncing` asserts a
      403 yields a message containing "Setting up an organization" and not the word "sync".
      `a_network_failure_is_not_a_refusal` asserts an unreachable server is `Error::Network`, not a
      refusal. `a_json_rpc_error_is_a_refusal_even_though_the_status_is_200` covers the case the
      transport calls success. Turso's own error text is never quoted into the message a customer
      reads.*
- [x] Live, once, and asked for first: one real consent, one `list_databases`, and the slug that
      comes back matches the account it was granted on. Admitted by name in ticket 22.
      *Verified 2026-09-11, asked for first. `discovery_live_reads_the_slug_off_a_real_account` ran
      against `mcp.turso.ai` with the token the 2026-08-30 consent filed in the keyring, handed to the
      test through the child process's environment and printed nowhere. `initialize` answered, the
      listing answered, and the parse read `saud-alnasser` out of a real hostname, which is the personal
      account the consent was granted on: Turso names a personal organization after its user. The first
      pass asserted against `rentable-co`, a value guessed from the module's own example hostname, and
      failed on the guess rather than on the lookup; the human confirmed the account and directed the
      work on. The token stays in the keyring and is in nothing committed.*
- [x] `pnpm test:rust` passes with `--test-threads=1`, and `cargo clippy` is clean.
      *Verified on the integrated effort branch.
      `cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml -- --test-threads=1`, which is what the
      script runs, gives `247 passed; 0 failed; 5 ignored` — thirteen of them this module's, and the
      fifth ignored is its live test. `cargo clippy --all-targets` gives five warnings, at
      `database/mod.rs:681` and `:682`, `settings.rs:122`, `sync/store.rs:485` and `database/version.rs:54`;
      all five stand at the branch point and none is in `discovery.rs` or at a line this diff touches.
      `cargo fmt --check`, which `.github/workflows/integration.yml:239` runs and ticket 20 landed
      failing, is clean — the reformat of `oauth/token.rs` and `turso/consent.rs` rides this commit.
      The root `pnpm test:rust` still cannot run in a deep worktree for the turbo reason already recorded
      in the pull request, and `pnpm --filter ./apps/desktop test:rust` is the form that passes.*

## Relevant areas

`apps/desktop/tauri/src/sync/turso/` is where this lands, beside `consent.rs`. It is deliberately
not inside `platform.rs`: [[efforts/819-an-organization-hosts-its-own-workspaces/plan]] puts the
MCP surface in one file so that when Turso versions it the diff is one file.

`apps/desktop/tauri/src/http/` holds the shared client and `install_crypto_provider`. Whatever this
uses for HTTP goes through the same place, for the reason `database/mod.rs` records.

`.aep/references/turso.md` records the hostname shape this parse depends on.

## Constraints

- **[[references/turso]], *Never run*.** `list_databases` reads. Nothing here creates, mints or
  deletes, and the first-database path belongs to ticket 05 rather than to this module.
- **The reply carries the customer's database names.** They are not logged, not surfaced, and not
  carried anywhere but into the slug this returns.
- **MCP is touched here and nowhere else.** A second caller means the boundary moved, and moving it
  is a plan question rather than an implementation one.

## Notes

`turso-cloud-mcp` reported `v0.1.0` and protocol `2025-06-18` on 2026-08-30. Turso documents the
tool set for agents rather than for clients, which is the risk the plan records and the reason this
is a setup-time lookup rather than anything on the provisioning path.

`list_databases` also returns `organization_id`, a UUID that is **not** the numeric `org_id` in the
token's claims. Neither is the slug and neither works in a Platform API path; only the hostname
answers. That was measured rather than assumed.
