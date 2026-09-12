---
status: open
blocked-by: []
---

# fix(organization): credentials renew before they lapse, and never for a removed member

## Outcome

An organization's credentials are renewed before they expire rather than never, so a workspace does
not stop syncing four weeks after it is created (F4), and a renewal seals nothing to a member whose
row is `removed` (F2's second half).

## Background

Every grant is minted at four weeks (`workspace::WORKSPACE_CREDENTIAL_LIFETIME`, `setup`'s
organization credential). `organization_renew_credentials` exists and reaches
`workspace::renew_credentials`, but nothing calls it except a lock-out and the tests. So on the
ordinary path every credential lapses at four weeks and the organization stops replicating, with no
interface to recover it but a removal. `renew_credentials` also iterates grants with no role filter,
so it re-seals to a removed member whose grant row was replayed (see ticket 23).

## Acceptance Criteria

Traces requirement 14 and requirement 18 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 14.

- [ ] **The owner's machine renews credentials before they lapse.** On the owner's machine, when a
      grant it can reach is within a renewal window of its expiry, `renew_credentials` is called
      without the owner pressing anything. Renewal needs the platform authority, which only the
      owner holds, so this is the owner's machine and no other; a member's machine that finds its
      credential refused already reconnects (`organization::reconnect`). A test shows a near-expiry
      grant triggers a renewal and a comfortably-live one does not.
- [ ] **A renewal seals nothing to a removed member.** `renew_credentials` skips a grant whose
      member row is `removed`, so a replayed grant earns no credential. A test pins it.
- [ ] The window and the trigger are named where the four-week lifetime is, so the two are read
      together.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Constraints

- A changeset is not written, for the reason ticket 23 gives.

## Notes

The trigger is the design-consistent answer to "no server renews anything": the owner's machine is
the only one that can, so it does, opportunistically, when it is running. An organization whose
owner never launches the application still lapses, which is inherent and belongs in
`[[contexts/desktop/organization]]` as a stated limit rather than a hidden one.
