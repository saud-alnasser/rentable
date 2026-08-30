---
status: open
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

- [ ] Live, admitted by ticket 01, both paths. After an ordinary removal no new credential is
      issued to the removed member and **every remaining member's sync is unbroken**. After a lock
      out, the removed member's existing credential is refused by Turso and a remaining member
      recovers by reaching the organization database once.
- [ ] **A test pins that removal leaves the removed member's local replica readable.** The limit is
      recorded as behaviour rather than discovered later as a bug, which is requirement 14's own
      instruction.
- [ ] The lock-out path states, before it runs, that every remaining member of that workspace will
      stop syncing until their application reconnects, and names how many members that is. Turso
      revokes per database and totally; nothing finer exists and the interface does not pretend
      otherwise.
- [ ] Ordinary removal is the default. `member_remove(member_id, lock_out: bool)` defaults to
      false, and the destructive path is chosen rather than fallen into.
- [ ] A removed member's grants are deleted and their member row is marked, both signed under
      ticket 07's chain, so a client that still holds a stale replica of the organization database
      sees a verified removal rather than an unexplained absence.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

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
