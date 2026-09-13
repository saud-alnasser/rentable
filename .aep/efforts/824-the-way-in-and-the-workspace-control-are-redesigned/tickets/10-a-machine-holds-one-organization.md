---
status: open
blocked-by: [09]
---

# feat(organization): a machine holds one organization

## Outcome

`remote-sync.json` records one organization or none, connected by the organization's link
without opening a vault, forgotten by a disconnect that leaves nothing of it on this machine,
and forgotten at startup where the machine holds the shape built before this effort.

## Acceptance Criteria

Traces requirement 17, requirement 18 and requirement 20 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 17, criterion 18 (the Rust half) and criterion 20 (the Rust half).

- [ ] `RemoteSyncStore.organization: Option<HeldOrganization>` replaces `organizations`, with
      `member_id: Option<String>` and `role: Option<String>`; `OrganizationState` and `host.ts`
      carry `organization: HeldOrganization | null`; every reader in Rust and in the frontend
      compiles against it.
- [ ] `organization_connect(link)` decodes the link, reaches the replica as `inspect` does, writes
      the record with no member, opens no vault, and returns the state; it refuses while an
      organization is held. Asserted in Rust against a store with one member.
- [ ] `organization::forget` closes and deletes every `org-*.db*` and `ws-*.db*` under the data
      directory, resets `organization`, `replicas` and `workspace`, clears the Turso authority, and
      commits; `organization_disconnect` calls it after signing out. Asserted on a temporary data
      directory holding one organization and two workspace replicas, the keyring behind a fake.
- [ ] The first `organization_state_get` of a launch forgets a record whose JSON still carries a
      non-empty `organizations` array, and a held organization whose replica has no
      `member.username_sealed` column or no replica file at all, and writes a diagnostic saying
      so. Asserted with a record of two and with a replica of the old schema.
- [ ] `cargo test` and `pnpm check` pass.

## Relevant areas

`apps/desktop/tauri/src/sync/store.rs`, `apps/desktop/tauri/src/organization/{mod,command,join}.rs`,
`sync/turso/consent.rs` (`disconnect`), `apps/desktop/src/lib/platform/host.ts`, `sync/admission.ts`.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *One organization on a machine*, and the two technical risks on deleting an open
  replica and on the startup check.**
- **The frontend's one confirm is ticket 13's and 14's**; the command asks nothing.
- **A changeset rides with the change.**
