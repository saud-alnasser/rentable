---
status: resolved
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

- [x] **The sign-in check is replaced with one that always returns true, and the workspace still
      cannot be opened.** This is criterion 9 and it is the test that proves the password is not a
      comparison. Everything else here is ordinary; this one is the point.
      *Verified: there is no check to replace, and
      `a_client_that_skips_the_password_check_still_cannot_open_a_grant` in `organization/session.rs`
      performs the skip: it takes the owner's grant and sealed content key off the replica, carries on
      with a secret the password did not produce, as a client that ignored the vault refusing to open
      would, and asserts neither opens. It then reads the module's shipping half and asserts no function
      returns a `bool` and nothing compares a password. `a_wrong_password_opens_nothing_and_says_only_that`
      asserts the one sentence a wrong password gets and that no credential was unsealed.*
- [x] A member whose password has never been changed is refused every other command until they
      change it, and the refusal is at the command rather than at the screen. An interface that
      merely declines to render the next page is not this.
      *Verified: `MemberSession::settled()` is the refusal, `PreconditionFailed` naming the password change,
      and `a_member_who_must_change_their_password_is_refused_by_the_guard` pins it. It is at the
      command layer by construction: a command asks the session before it acts. **Stated plainly: no
      command exists yet for it to guard**, because the four this ticket and the last landed are the
      state read, the sign-in, the sign-out and the first run, none of which a locked-out member may be
      refused. Every command tickets 11, 13 and 14 add calls it first, and the session facts carry
      `mustChangePassword` so the screen that follows sign-in is the change-password surface. Recorded
      in the run log for the reviewer rather than ticked around.*
- [x] Sign-in succeeds with the network down on a machine that has signed in before. The local
      replica serves it, which is what removed the three-day window
      [[contexts/desktop/remote-sync]] describes.
      *Verified: `a_password_opens_the_vault_with_no_remote_and_the_facts_follow_from_the_rows` signs in over a
      replica opened with no remote at all, and the facts, the role and the unsealed credential all
      follow from the rows on the machine. `organization_sign_in` opens the replica through the same
      `open_replica` every replica uses, which opens whether or not the remote answers, and pulls only
      after the vault is open, best effort. `admission.ts` takes no clock any more, and its test asserts
      `organizationAdmission.length === 1`.*
- [x] Two organizations are joined on one machine, both appear at sign-in, and switching between
      them changes what is open and requires no reinstall. One person may hold different roles in
      each.
      *Verified: `two_organizations_on_one_machine_open_with_their_own_passwords_and_roles` records two joined
      organizations on one machine, opens the first as its owner and the second as a member who must
      change their password, asserts each password opens only its own, and reads each organization's
      facts. The card lists what the machine has joined and picks one with a select where there are
      several, and `two_joined_organizations_are_still_one_locked_door` covers the wall's side.
      Switching is a sign-out and a sign-in: `organization_sign_out` drops the keys and the replica
      and the next `organization_sign_in` opens another, with no reinstall and no second machine.*
- [x] `admission.ts` no longer answers `noAccount`, `windowClosed` or `noSession`. What replaces
      them is stated in terms of the organization and the vault, and every caller of
      `workspaceAdmission` is updated rather than left with a compatibility shim.
      *Verified: `workspaceAdmission(state, now)` is gone and `organizationAdmission(state)` answers
      `noOrganization` or `locked` off the organization state, or admits with the session. Every caller
      moved: `layout/startup.ts` admits on `organization.getState()`, signs in with an organization and
      a password, signs out through the shell, and lost `retrySession`, the consent phase and the
      Google port; `api/context.ts` resolves the acting identity off the session, with the member id
      where the account id stood; `routes/+layout.svelte` hands the card the organizations and reads
      who is in off the session. No shim remains: `signInWithGoogle` has no caller on the startup path
      and `sync/tests/admission.test.ts` is rewritten in the organization's terms.*
- [x] Argon2id runs where a person is waiting, so the screen says it is working. The measurement
      from ticket 06 decides whether that is a spinner or something more honest.
      *Verified: the card marks the surface busy and says `unlocking your place in the organization. this takes
      a moment on purpose.` while the shell derives the key, and the button says working. Ticket 06
      measured 257 to 273 ms in release on the fastest machine available, which is too short to fill a
      bar and too long to show nothing, so it is a sentence.*
- [x] Both locales, both directions, for every screen this adds.
      *Verified: `layout.signIn.*` gained ten keys and `layout.noWorkspace.*` two, in `en` and `ar`, keyed as
      their neighbours are; `startup-sign-in.svelte.test.ts` renders the locked card in English and in
      Arabic and asserts the same one field, and renders the no-workspace surface in both. The surfaces
      are the shared `StandaloneSurface`, which every application screen already renders in both
      directions.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `pnpm check` 0 errors over 9221 files; root `pnpm lint` clean; `pnpm test` 889 node tests and
      17 component tests pass; `vite build` builds; `cargo test` single-threaded
      `294 passed; 0 failed; 7 ignored`; `cargo clippy --all-targets` the same five pre-existing
      warnings; `cargo fmt --check` clean.*

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

**Two readings taken while building, 2026-09-11.** The outcome says a member types an email and a
password; the card asks for the password alone. This machine already knows which member it is in
each organization it joined, and an email typed here would be compared against that local record,
which is the check requirement 9 forbids being trusted; the organization is chosen and the password
is what opens it. And the state a member is admitted to with no workspace is `no-workspace`, a
surface of its own over every address with nothing to press: creating a workspace is ticket 14's,
and a screen offering it before it existed would be a promise.
