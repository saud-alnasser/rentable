---
status: open
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

- [ ] The module completes an MCP `initialize` and one `tools/call` of `list_databases` over
      streamable HTTP against the resource the consent was granted for, and reads the reply. The
      shape is recorded in
      [[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]].
- [ ] **The slug is derived by removing the record's own `Name` from its `hostname`**, never by
      splitting on dashes. A hostname is `<name>-<slug>.<region>.turso.io` and both a database name
      and an organization slug may contain dashes, so the only unambiguous parse is the one that
      subtracts a value the same record supplies. A test covers a slug containing a dash and a
      database name containing several.
- [ ] **An empty group is not a failure.** Requirement 3 asks the customer to prepare an empty
      group, so the common first run has nothing to list. The module reports *no database yet*
      distinguishably, and the caller creates the first database and reads the slug from what comes
      back.
- [ ] The slug is stored locally, beside the organizations this machine has joined, and is not a
      credential and not in the organization database. A test asserts a second provisioning call
      makes no MCP request.
- [ ] A refusal from the MCP server is distinguishable from a network failure and from an empty
      group, and its message names setup rather than sync. This is a first-run lookup and a
      customer who hits it has no workspace yet.
- [ ] Live, once, and asked for first: one real consent, one `list_databases`, and the slug that
      comes back matches the account it was granted on. Admitted by name in ticket 22.
- [ ] `pnpm test:rust` passes with `--test-threads=1`, and `cargo clippy` is clean.

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
