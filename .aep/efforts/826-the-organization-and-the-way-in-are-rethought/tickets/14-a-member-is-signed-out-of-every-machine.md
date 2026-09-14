---
status: resolved
blocked-by: ['04', '05', '09', '10']
---

# feat(organization): a member is signed out of every machine

## Outcome

A member signs themselves out of every other machine from the you section and stays signed in
where they are; the owner and a holder of `resetPassword` sign any member but the owner out of
every machine from the member's row. A machine that is behind forgets its remembered key at the
next launch and shows the wall; a session open at the time ends at the next sync heartbeat and
the wall says it was signed out from another machine.

## Acceptance Criteria

Traces requirement 22 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 22.

- [x] `member` carries `session_epoch INTEGER NOT NULL DEFAULT 0` outside the member
      signature; `MemberRecord` and `MemberSession` carry it; the keyring entry files
      `<epoch>:<base64url key>` and `session::resume` refuses an entry whose epoch is behind
      the row's, forgetting it; `forget::OldShape` gains a variant for a `member` table
      without it with a startup test; the seven-tables pin in `store.rs` follows.
- [x] `session::end_elsewhere(store, session, now)` bumps the caller's row and pushes, moves
      the open session to the new epoch and rewrites the keyring entry; a Rust test over two
      stores signs the same member in on both, ends elsewhere on the first, and asserts the
      first still resumes and the second's resume forgets its entry and answers the
      signed-out-elsewhere standing.
- [x] `session::end_member_sessions(store, session, member_id, now)` requires `ResetPassword`,
      refuses the caller's own row and the owner's row for anybody but the owner with one
      sentence each, bumps the target's epoch and pushes; asserted in `session.rs` with an
      administrator and a plain member.
- [x] The command the sync heartbeat calls (read `sync/autosync.ts` for which) pulls the
      organization replica and, where the session's epoch is behind the row's, empties the
      `member` slot, forgets the entry and answers a standing the frontend reads;
      `autosync.ts` calls `startup.standingChanged()` on it and the wall shows the
      signed-out-elsewhere sentence, present in both locales; a Rust test over two stores
      asserts the open session on the second is gone after one heartbeat call, and
      `autosync.test.ts` asserts the call.
- [x] `command.rs`, `host.ts`, `platform/tauri.ts` and `organization/router.ts` carry
      `session_end_elsewhere()` under `procedure.member` and `member_end_sessions(member_id)`
      under `resetPassword`; `router.test.ts` pins them.
- [x] The you section carries a "sign out of other machines" control with a confirm dialog,
      asserted in the section's test; the member row's action cluster carries "sign out
      everywhere" behind `resetPassword` and never on the owner's row, asserted in the members
      section's test; every new string is written in both locales.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; a changeset rides with the
      change.

## Relevant areas

`apps/desktop/tauri/src/organization/{session,store,forget,command}.rs`,
`tauri/src/keyring.rs` (read), the sync command the heartbeat calls;
`apps/desktop/src/lib/sync/autosync.ts`, `layout/component/startup-sign-in.svelte`,
`settings/component/**` (the you section), `organization/component/members.svelte`,
`platform/{host,tauri}.ts`, `organization/{router,query}.ts`, `i18n/{en,ar}/index.ts`, and
the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *A member is
  signed out of every machine*.**
- **[[rules/credentials]]**: the epoch is not a secret and the key never crosses; the entry
  is read and written by Rust alone.
- **A machine that ends its own other sessions stays signed in**; nothing here asks the
  person for their password.
- **No new act.** The gate is `resetPassword`, and the owner's row is only the owner's to end.

## Notes

Built by an implementer and landed on 2026-09-14. Departures: `session::resume` answers
`Resumption::{Opened, SignedOutElsewhere}` rather than an error, since being signed out from
elsewhere is not a failure and the wall must tell it from one; `resume` pulls, and the pull in
`command::resume_remembered` was removed so there is one round trip; the member row's action
acts on the press with no confirm, matching the new link beside it, and the you section alone
confirms; `end_member_sessions` refuses the owner's row unconditionally, the owner reaching
their own row being caught first by the own-row refusal; `remote_sync_replicate` asks the
standing before the workspace replication, so a signed-out machine does not push under a
credential the organization moved past; `Replication::from` became `Replication::of(replicated,
standing)`; `AppState` carries `signed_out_elsewhere`, answered on
`OrganizationState.signedOutElsewhere` and cleared whenever a session exists;
`organizationAdmission` returns a third reason and `autosync.ts` gained `onSessionEnded`, wired
in the layout to `startup.standingChanged()`; the keyring entry's reader `read_entry` is
`pub(crate)` for the tests beside sign-in, accept and password change; six hand-built
`OrganizationState` and `replicate` fixtures took the new field.

Raised, not taken: `end_elsewhere` cannot rewrite an entry the credential store never took,
so such a machine stays in for the run and meets the wall at its next launch; a machine
offline when its sessions are ended stays in until it reconnects, which is the requirement's
"within one heartbeat of the push reaching it"; the two-store tests model a second machine
over the same replica file, a true two-machine test needing the live remote; a fourth standing
would be the moment to fold the booleans on `OrganizationState` into one union; nothing
invalidates the members list when a heartbeat ends the session, since the wall clears the
whole cache.
