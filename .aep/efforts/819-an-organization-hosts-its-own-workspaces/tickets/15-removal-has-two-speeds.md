---
status: resolved
blocked-by: ['14']
---

# feat(organization): removal has two speeds

## Outcome

Removing a member stops renewing their credential, which ends their access within its lifetime and
disturbs nobody. Removing and locking out rotates the workspace's credentials, which cuts the
member off at once and stops every remaining member's sync until their application collects a
re-sealed credential. The interface says what the second one costs before it does it, and neither
takes back the replica already on the removed member's disk.

## Acceptance Criteria

Traces requirement 14 and requirement 21 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 14 and
criterion 21.

- [x] Live, admitted by ticket 01, both paths. After an ordinary removal no new credential is
      issued to the removed member and **every remaining member's sync is unbroken**. After a lock
      out, the removed member's existing credential is refused by Turso and a remaining member
      recovers by reaching the organization database once.
      *Verified: 2026-09-12, asked for first.
      `removal_live_an_ordinary_removal_breaks_nobody_and_a_lock_out_is_refused_by_turso`
      provisioned `t819-15-18d475ec76bf64fc` in `rentable`, applied the shipped schema, minted two
      full-access credentials, the removed member's and a remaining member's, and pushed a row
      under each. After the ordinary removal, which rotates nothing, the remaining member's push
      landed again. After `rotate_credentials` on that one database, the removed member's push was
      refused by Turso with `401 Unauthorized: invalid JWT token: role was invalidated after token
      was issued`, the remaining member's old credential was refused the same way, and a credential
      minted after the rotation landed, which is the re-sealed grant their application collects.
      The database was deleted by the same run. The recovery itself,
      `session::refresh_credentials` run by `organization::reconnect` when a replication fails,
      needs no live account and is `a_lock_out_rotates_the_workspaces_held_re_seals_everybody_else_and_says_the_cost`,
      where the remaining administrator reads their grants again and holds the fresh credential.*
- [x] **A test pins that removal leaves the removed member's local replica readable.** The limit is
      recorded as behaviour rather than discovered later as a bug, which is requirement 14's own
      instruction.
      *Verified: `removal_leaves_the_removed_members_local_replica_readable` copies the
      organization replica's files to a second directory before the removal, as the member's own
      machine would hold them, removes the member, opens the copy with no remote, and signs in on
      it with the member's password: the rows verify, the row still says member, and both
      workspace credentials unseal. Removal ends synchronisation and reaches into nothing; the
      dialog says so in both locales.*
- [x] The lock-out path states, before it runs, that every remaining member of that workspace will
      stop syncing until their application reconnects, and names how many members that is. Turso
      revokes per database and totally; nothing finer exists and the interface does not pretend
      otherwise.
      *Verified: `removal::lock_out_cost` reads which workspaces the member holds and how many
      other members hold each, and `remove_member` uses the same reading for its answer, so the
      number stated is the number the act uses; the lock-out test asserts `[("North", 1),
      ("South", 0)]` and `members_affected: 1` beforehand and `others_must_reconnect: 1` after. The
      dashboard's lock-out dialog waits on `member.lockOutCost` and draws
      `organization.dashboard.lockOutDescription` with the count and the workspace names, saying
      Turso revokes per workspace and totally and that the others reconnect on their own. The
      Turso reference is corrected: revocation is per database, not group-only, seen live.*
- [x] Ordinary removal is the default. `member_remove(member_id, lock_out: bool)` defaults to
      false, and the destructive path is chosen rather than fallen into.
      *Verified: the command takes `lock_out: Option<bool>` and reads it `unwrap_or(false)`; the
      router's `member.remove` input defaults `lockOut` to false; the dashboard draws the ordinary
      removal as the outline control and the lock-out as a separate ghost control for the owner
      alone, each behind its own dialog. `members.svelte.test.ts` asserts the two are drawn apart,
      the lock-out for the owner only, and neither on the owner's row or the reader's own. A
      lock-out by an administrator is refused by name before any write, and by an owner on a
      machine without the authority too (`the_refusals_come_before_any_write`).*
- [x] A removed member's grants are deleted and their member row is marked, both signed under
      ticket 07's chain, so a client that still holds a stale replica of the organization database
      sees a verified removal rather than an unexplained absence.
      *Verified: `remove_member` deletes every grant row of the member and rewrites their member
      row through the signed `write_member` with role `removed` and permissions 0, signed by the
      remover's certificate; `store.members` verifies it on every read, and
      `an_ordinary_removal_stops_renewing_and_disturbs_nobody` reads the row back verified as
      removed, finds no grant, finds the dashboard's list without them, has their sign-in refused
      saying they were removed, and asserts every other member's rows byte-identical with nothing
      minted or rotated and the remaining administrator's credentials unmoved. A second removal is
      refused as already done.*
- [x] Both locales, both directions.
      *Verified: `organization.dashboard.{remove, removeDescription, removeAndLockOut,
      lockOutReading, lockOutDescription, removed, lockedOut}` in `en/index.ts`, `ar/index.ts` and
      the generated `i18n-types.ts`, the counts through the number formatter; `pnpm check` 0
      errors; `members.svelte.test.ts` renders the two controls in Arabic and asserts they are
      named apart.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` clean; `pnpm test`
      904 node tests and 40 component tests pass; `vite build` builds. `cargo test
      --test-threads=1` 329 passed, 0 failed, 9 ignored; `cargo clippy --all-targets` the same five
      warnings that stand at the branch point, none in `organization/`; `cargo fmt --check` clean.*

## Relevant areas

`apps/desktop/tauri/src/sync/turso/platform.rs` from ticket 05 is where rotation lives, and
`organization/store.rs` from ticket 08 holds `grant` with its `credential_expires_at`, which is
what ordinary removal stops advancing.

The renewal path built in ticket 14 is the mechanism ordinary removal turns off. If renewal is not
a distinct thing there, removal has nothing to stop and this ticket will find that.

`apps/desktop/src/lib/organization/` holds the dashboard from ticket 11 where both paths are
offered.

## Constraints

- **[[references/turso]], *Never run*, and rotation is named in it.** Do not rotate or revoke
  anything belonging to the human's own account outside a database this run created. Ask before the
  live half.
- **Do not promise more than the architecture can keep.** Removal ends future synchronisation. It
  does not reach into a machine that is already holding data, and the interface must not imply that
  it does.
- **The recovery after a lock-out is automatic, not a support call.** A remaining member's
  application reaches the organization database, finds a re-sealed grant, and resumes. If that
  needs a human step, say so plainly rather than shipping it quietly.

## Notes

The spec settled this on 2026-08-30 after rejecting both simpler answers. Rotating always was
rejected because an ordinary departure would break every colleague's sync, including anybody
offline at the time. Never rotating was rejected because it leaves no answer at all for the
departure that is not ordinary.
