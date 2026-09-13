---
status: resolved
blocked-by: [09, 10]
---

# feat(organization): signing in is username and password

## Outcome

`organization_sign_in(username, password)` finds the account by the password and checks the
username, consumes a pending invitation on the first sign-in, and fills the record's member; the
invitation has no sealed half, the link has no invitation half, and `join` and `restore` are gone.

## Acceptance Criteria

Traces requirement 19, requirement 18 and requirement 22 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 19 and criterion 18 (the Rust half).

- [x] `organization_sign_in(username, password)` opens a session when the pair matches a member
      of the held organization; the wrong password, an unknown username, and a known username with
      another member's password are each refused with the same one sentence. Asserted over a store
      with two members. *Verified 2026-09-13 on the effort branch: `cargo test organization` printed 142 passed, with `a_username_and_password_that_match_a_member_open_a_session_and_fill_the_record` and `the_wrong_password_an_unknown_username_and_another_members_password_are_one_sentence`.*
- [x] A first sign-in by a member with an open invitation marks it consumed and pushes, and the
      session carries `must_change_password`; a lapsed invitation refuses by name; sign-out leaves
      the record naming the organization with its member. Asserted. *Verified: the same run, `a_lapsed_invitation_refuses_the_first_sign_in_by_name_and_a_reissue_admits` and `signing_out_leaves_the_record_naming_the_organization_with_its_member`; and `a_revoked_account_is_refused_with_the_one_sentence`, added at integration (see Notes).*
- [x] `invitation` carries `id`, `member_id`, `expires_at`, `consumed_at`, `certificate_id`,
      `signature`, `created_at` and no `sealed_payload`, `kdf_salt` or `kdf_params`; `JoinLink`
      has no `invitation`; `open_invitation`, `InvitationPayload`, `join::join`, `join::restore`,
      `organization_join` and `organization_restore` do not exist (`grep`). `LinkStanding` keeps
      what the connect screen reads. Reissue and revoke still work over the columns that stay. *Verified: the child's `grep` over both trees for the removed names printed nothing; the invitation's `CREATE TABLE` names seven columns; reissue and revoke tests pass in the same run.*
- [x] `host.ts`, `platform/tauri.ts`, `organization/router.ts` and `organization/join.ts` lose
      the join and restore calls and gain `signIn(username, password)`. *Verified: `host.ts`, `tauri.ts`, `startup-ports.ts` and `startup.ts` carry `signIn(username, password)` and no join or restore; `router.ts` and `join.ts` never carried them (repository wins, the child's finding).*
- [x] `cargo test` and `pnpm check` pass. *Verified on the effort branch with 13 folded: `cargo test` 291 passed before the two additions and 142 organization tests after; `svelte-check` 9278 files 0 errors; node:test 903; vitest 87; prettier clean; eslint 0.*

## Relevant areas

`apps/desktop/tauri/src/organization/{join,session,invite,link,store,command}.rs`;
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `organization/{router,join}.ts`.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *Signing in is username and password*.**
- **[[rules/credentials]]**: one sentence for every refusal that could tell a username from a
  password; the cost of trying every vault is the spec's constraint, not something to index
  around.
- **A changeset rides with the change.**

## Notes

Built 2026-09-13. What a later reader needs, each inside the plan's bounds:

- **The shapes.** `organization_sign_in(username: String, password: String) -> OrganizationState`;
  it refuses a machine holding nothing with `PreconditionFailed` before any replica opens. The
  sign-in is in two halves: `session::sign_in_by_username(store, held, username, password,
  credential) -> MemberSession` finds the row (one Argon2id derivation per non-removed member,
  then the sealed username against the typed one, trimmed and lower-cased) and refuses all three
  cases with `Forbidden`, "the username and password do not open a place in {name}";
  `join::admit(store, machine, held, username, password, credential, now) -> MemberSession` is
  the wall's whole act: it calls the first, spends an unconsumed invitation naming the member
  (consume, push, `organization.invitation.consumedNotYetSent` where the push stays local) or
  refuses a lapsed one with "the invitation to {name} has lapsed; ask whoever invited you for a
  new one", then writes the record with `member_id` and `role` filled and commits. The command
  calls `admit`. `session::sign_in(store, held, password, credential)` stays as the sign-in of a
  record that already names its member, which `organization_create` and every test fixture use;
  the two share `open_session`, so there is one unsealing.
- **`Invited` is exactly** `{ member_id, invitation_id, username, join_link, generated_password,
  expires_at, unreachable_workspaces }`, camel-cased across the boundary (`memberId`,
  `invitationId`, `username`, `joinLink`, `generatedPassword`, `expiresAt`,
  `unreachableWorkspaces`). `join_link` is the organization's own link, byte for byte what
  `organization_link` mints, and a reissue hands the same link and the row's existing username
  with a fresh password. The two existing names were kept rather than renamed to `link` and
  `password` so `invite-form.svelte` (ticket 15's) kept compiling untouched; ticket 15 draws the
  three and may rename.
- **The invitation's signature covers `id`, `member_id` and `expires_at`**, the sealed payload's
  place taken by the member it named; `authority::INVITATION_DOMAIN` is `...invitation.v2` so a
  `v1` signature cannot pass over the new preimage by accident. `InvitationRecord` is
  `{ id, member_id, expires_at, consumed_at, created_at }`; the table lost `sealed_payload`,
  `kdf_salt` and `kdf_params`. `vault.rs` lost `SealedInvitation`, `seal_invitation`,
  `open_invitation`, `INVITATION_SECRET_BYTES` and its invitation HKDF domain; `link.rs` lost
  `invitation`, `InvitationHalf`, `for_invitation` and `invitation_secret`.
- **`LinkStanding` is kept whole, with `None` the only value produced.** `join::inspect(store,
  link)` (it no longer takes `now`) verifies the member rows against the pinned key and answers
  `LinkStanding::None`; the four invitation variants are documented as unconstructed on both
  sides. Shrinking the enum would have broken `join-screen.svelte`, which reads all five in the
  `refused` step and is ticket 13's file, in flight beside this one; the redraw that drops the
  steps is the one that retires the values, and `LinkFacts.standing` with them if nothing reads
  it after.
- **The frontend, and what the ticket names that the repository does not carry.**
  `host.organization.signIn(username, password)`; `join` and `restore` are gone from `host.ts`,
  `platform/tauri.ts`, `platform/tests/testing.ts`, `startup.ts` (`joinByLink`, `restoreByLink`
  and their ports), `startup-ports.ts` and the startup test harness. `organization/router.ts`
  never carried a sign-in, join or restore procedure (the wall reaches the host through the
  startup ports, not tRPC), and `organization/join.ts` holds the connect screen's steps and no
  call, so neither file changed; the criterion names them from the plan's sentence about
  callers, and the callers were the files above.
- **Two screens compile on stubs until their tickets.** The wall (`routes/+layout.svelte`) hands
  `startup.signIn('', password)` with a comment naming ticket 14: it has no username field yet,
  so every unlock is refused with the one sentence until 14 redraws it, the same bridge ticket 09
  left the walk on. The connect screen's route (`routes/organization/join/+page.svelte`) has
  `onJoin` and `onRestore` as no-ops with a comment naming ticket 13; the component and its test
  are untouched.
- **A finding, raised and not taken: a revoked invitation no longer stops the handed password.**
  The plan's *Expiry at sign-in* says a revoked invitation "reads `removed` on the row already";
  it does not. `revoke_invitation` deletes the invitation row and leaves the member row, its vault
  under the generated password and `must_change_password` set, so a person holding that password
  signs in by username and is asked to choose their own. Under 819 the same person could do it
  through restore with the organization's link, so nothing regressed, and the ticket's enumerated
  refusals are built as written. If revoke is to end a pending account, the sign-in should refuse
  a member with `must_change_password` and no invitation row ("the invitation to {name} was
  revoked; ask whoever invited you for a new one", the sentence 819's join used), or revoke
  should write the row `removed`; either is a decision for the plan, not this ticket.
- **A second finding: the startup shape check does not see this schema change.** `forget.rs`
  reads `member.username_sealed` alone; a replica built between tickets 10 and 11 keeps the
  three `NOT NULL` invitation columns under `CREATE TABLE IF NOT EXISTS`, and every invite write
  on it fails. Nothing is published and the human's machine holds the pre-09 shape, which the
  check already forgets; a `PRAGMA table_info(invitation)` for `sealed_payload` would close it.
- **`command::sign_out(app_state)` is the sign-out**, called by `organization_sign_out` and by
  `forget` where it duplicated the two lines; `join.rs` drives it over a whole `AppState` (the
  `state_over` fixture copied from `forget.rs`, as [[rules/testing]] has fixtures copied) to
  assert the record survives.
- **The live restore test** (`restore_live_...`, admitted under the sixth property in
  [[rules/testing]]) now connects machines B and C by the link and admits by username; it
  compiles and was not run ([[references/turso]], *Never run*).
- **[[contexts/desktop/organization]]'s *Link* paragraph** was corrected in the same breath: one
  link, no invitation half.
- **Building here.** `CARGO_TARGET_DIR` pointed at a short directory under the session
  scratchpad, as tickets 09 and 10 noted; clippy's five warnings are the same five pre-existing
  ones outside the organization module.

**Closed at integration, 2026-09-13.** The two findings the child raised were taken by the
orchestrator inside this commit: `join::admit` refuses a handed password whose member has no
invitation row at all, spent or open, with the one sentence `session::refused_by_name` now
holds for every refusal (a revoke deletes the row and nothing else, so the vault still opened);
and `forget::forget_old_shape` reads `invitation`'s columns too, so a replica with usernames and
the sealed half, the shape between tickets 10 and 11, is forgotten at startup. The plan's
"Expiry at sign-in" and the startup-check risk say so.

