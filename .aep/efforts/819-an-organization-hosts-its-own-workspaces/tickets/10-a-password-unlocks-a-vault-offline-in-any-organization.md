---
status: open
blocked-by: ['09']
---

# feat(organization): a password unlocks a vault, offline, in any organization

## Outcome

The login screen lists the organizations this machine has joined and switches between them. A
member picks one, types an email and a password, and the password unlocks their credentials rather
than being compared against anything. It works with the network down.
`apps/desktop/src/lib/sync/admission.ts` is rewritten: its three reasons are replaced by the
organization's own.

## Acceptance Criteria

Traces requirement 9, requirement 10, requirement 17, requirement 18 and requirement 21 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 9, criterion 10,
criterion 17, criterion 18 and criterion 21.

- [ ] **The sign-in check is replaced with one that always returns true, and the workspace still
      cannot be opened.** This is criterion 9 and it is the test that proves the password is not a
      comparison. Everything else here is ordinary; this one is the point.
- [ ] A member whose password has never been changed is refused every other command until they
      change it, and the refusal is at the command rather than at the screen. An interface that
      merely declines to render the next page is not this.
- [ ] Sign-in succeeds with the network down on a machine that has signed in before. The local
      replica serves it, which is what removed the three-day window
      [[contexts/desktop/remote-sync]] describes.
- [ ] Two organizations are joined on one machine, both appear at sign-in, and switching between
      them changes what is open and requires no reinstall. One person may hold different roles in
      each.
- [ ] `admission.ts` no longer answers `noAccount`, `windowClosed` or `noSession`. What replaces
      them is stated in terms of the organization and the vault, and every caller of
      `workspaceAdmission` is updated rather than left with a compatibility shim.
- [ ] Argon2id runs where a person is waiting, so the screen says it is working. The measurement
      from ticket 06 decides whether that is a spinner or something more honest.
- [ ] Both locales, both directions, for every screen this adds.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Relevant areas

`apps/desktop/src/lib/sync/admission.ts` holds `workspaceAdmission(state, now)`, returning
`starting`, `signInRequired` with a reason of `noAccount`, `windowClosed` or `noSession`, or
`admitted`. Its callers include `+layout.svelte`.

`apps/desktop/tauri/src/organization/vault.rs` from ticket 06 is what a password is handed to, and
`store.rs` from ticket 08 is where the member row and its grants are read.

The local list of joined organizations is a machine-local record, not a database query. The plan
notes under *The key schedule* that this is why no blinded email lookup is needed: sign-in already
knows the member id before a password is typed, and `email_local_hint` is a convenience for telling
two members apart on a shared machine.

## Constraints

- **No password, key, or credential crosses to TypeScript** ([[rules/credentials]], *Client
  boundary*). The web layer sends a password to a Rust command and receives an outcome.
- **A wrong password produces no distinguishable failure beyond "that did not open".** Do not add a
  message that tells an attacker which half was wrong.
- **The local list is not authority.** What a member may do comes from their verified row and the
  grants their vault opens, never from what the machine remembers about them.

## Notes

This is where the effort stops being infrastructure. Everything before it is provable in a test;
from here a person can use it.

The `session` table has no successor and this ticket is where that becomes visible. There is no
refresh window, no absolute expiry, and nothing to renew: the vault is open or it is not.
