---
status: open
blocked-by: ['02', '03']
---

# feat(organization): a signed-in machine stays signed in

## Outcome

After a sign-in, an accepted link or a password change, the derived member key is in the OS
credential store; the first state read of the next launch opens the vault with it and the
application goes straight to the last workspace; sign-out and disconnect forget it; a key that
no longer opens the vault is forgotten and the wall shows. The forced password-change surface
and its startup state retire, since no first sign-in is on a handed password any more.

## Acceptance Criteria

Traces requirement 12 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 12.

- [ ] `session::remember(session, organization_id)` files the member key under service
      `rentable.member-key`, account `<organization id>:<member id>`, base64url, and
      `session::resume(store, held, credential)` reads it, opens the vault through
      `open_sealed_secret_key` and `open_session`, and forgets the entry on any failure;
      `sign_in_by_username`, `join::accept`, `password::change_password` and
      `setup::create_organization` remember; `command::sign_out` and `forget::forget` forget.
      Asserted over the keyring fake in `session.rs` and `command.rs`, including resume after a
      reset elsewhere failing and forgetting.
- [ ] `command::state_of` resumes inside the once-per-launch cell after the old-shape check,
      when the record names a member and the `member` slot is empty; a store refusal on
      remember is a diagnostic and the sign-in still succeeds.
- [ ] A Rust test signs in, then reads `remote-sync.json` and every replica file under the data
      directory and asserts neither the member key's bytes nor the password appear.
- [ ] `sync/admission.ts` has two kinds, `signInRequired` and `admitted`; `layout/startup.ts`
      loses the `change-password` state, the `changePassword` method and its port;
      `layout/component/startup-change-password.svelte` and `layout.changePassword.*` in both
      locales are deleted; `shell-surface.ts` and `+layout.svelte` lose the branch;
      `OrganizationSession` loses `mustChangePassword`.
- [ ] `startup.test.ts`: a state whose first `getState` carries a session reaches `ready` with
      the last workspace open and never shows `sign-in`; after `signOut()` the next `start()`
      shows `sign-in` as `locked`.
- [ ] Verified once by hand across a relaunch on the human's machine, recorded under Notes.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; a changeset rides with the
      change.

## Relevant areas

`apps/desktop/tauri/src/organization/{session,join,password,setup,command,forget}.rs`,
`tauri/src/keyring.rs`; `apps/desktop/src/lib/sync/admission.ts`, `layout/startup.ts`,
`layout/shell-surface.ts`, `layout/component/startup-change-password.svelte`,
`routes/+layout.svelte`, `platform/host.ts`, and their tests.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *A remembered
  session is the derived member key in the keyring*.**
- **[[rules/credentials]]**: the key is filed by Rust and read by Rust; nothing about it
  crosses. `remote-sync.json` never carries it.
- **A keyring that refuses never fails a sign-in or a launch**; the wall is the fallback.
- **The by-hand relaunch is asked for first** where the human is at the machine.

## Notes

Nothing yet.
