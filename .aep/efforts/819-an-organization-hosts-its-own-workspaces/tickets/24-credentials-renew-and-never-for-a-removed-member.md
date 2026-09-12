---
status: resolved
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

- [x] **The owner's machine renews credentials before they lapse.** On the owner's machine, when a
      grant it can reach is within a renewal window of its expiry, `renew_credentials` is called
      without the owner pressing anything. Renewal needs the platform authority, which only the
      owner holds, so this is the owner's machine and no other; a member's machine that finds its
      credential refused already reconnects (`organization::reconnect`). A test shows a near-expiry
      grant triggers a renewal and a comfortably-live one does not.
      *Verified: `workspace::credentials_due` answers whether any grant expires within a window of
      now, and `organization_renew_due` (owner-only via `owner_platform`, no-op and `false` for
      anyone else or when nothing is due) calls `renew_credentials` when it is. The frontend fires
      it best effort from `startup.#enterApplication` after entry, never awaited, so an offline
      sign-in is unaffected (requirement 18). `credentials_due_answers_on_the_soonest_expiry` shows
      a grant three days out is due within a week and not within a day, and that nothing is due
      within a second of now.*
- [x] **A renewal seals nothing to a removed member.** `renew_credentials` skips a grant whose
      member row is `removed`, so a replayed grant earns no credential. A test pins it.
      *Verified: `renew_credentials` builds its member map filtering `role != REMOVED`, so a
      grant whose member is removed finds no public key and is skipped.
      `renew_credentials_seals_nothing_to_a_removed_member` marks a granted member removed while
      leaving their grant in place, as a replay would, and asserts the renewal count drops from
      three to two.*
- [x] The window and the trigger are named where the four-week lifetime is, so the two are read
      together.
      *Verified: `CREDENTIAL_RENEWAL_WINDOW_MS` sits beside `WORKSPACE_CREDENTIAL_LIFETIME` in
      `workspace.rs`, and [[contexts/desktop/organization]] records the renewal, the owner-only
      limit, and the inherent lapse when an owner does not launch for a month.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `svelte-check` 0 errors, `eslint` clean, node 894, vitest 45, `cargo test --
      --test-threads=1` 279 / 10 ignored (stable ×3, the repo's gate mode), `cargo clippy
      --all-targets` at the five pre-existing warnings, `cargo fmt` clean.*

## Constraints

- A changeset is not written, for the reason ticket 23 gives.

## Notes

The trigger is the design-consistent answer to "no server renews anything": the owner's machine is
the only one that can, so it does, opportunistically, when it is running. An organization whose
owner never launches the application still lapses, which is inherent and belongs in
`[[contexts/desktop/organization]]` as a stated limit rather than a hidden one.
