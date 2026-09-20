---
use-when: "judging whether effort 828's branch meets its spec, or deciding what its close has to correct outside the effort"
---

# Question

Taken whole at `ce612e50`, does the effort branch of 828 meet each of its spec's 22 acceptance
criteria, and what sentence in a context, a rule, a reference, 826's spec or its own changeset did
the branch make false?

# Sources

Read on 2026-09-16 in the run's worktree
(`.aep/worktrees/828-the-link-needs-a-code-and-the-settings-area-guides/_run`), on branch
`graphite/docs/828-the-link-needs-a-code-and-the-settings-area-guides` at `ce612e50`, with
`f56ac57a` as the base. The tree was read; nothing was run that writes to it, and
`git status --porcelain` was empty before and after.

- `.aep/efforts/828-.../spec.md`, `plan.md` and all seventeen files under `tickets/`. The tickets'
  ticked evidence was treated as a claim to confirm against the tree, never as the answer.
- The whole diff: `git diff f56ac57a..HEAD --stat` (108 files, 17388 insertions, 5879 deletions),
  then the hunks each criterion needed.
- `.aep/contexts/desktop/organization.md`, `.aep/rules/credentials.md`,
  `.aep/references/turso.md` and `.aep/efforts/826-.../spec.md`, each read entire.
- Source, not summaries: `apps/desktop/tauri/src/organization/{link,invite,join,machine,connect,
  setup,store,removal,role,forget,command}.rs`, `apps/desktop/tauri/src/lib.rs`,
  `apps/desktop/src/lib/organization/{query,router,connect,setup}.ts`,
  `apps/desktop/src/lib/organization/component/{members,workspaces,made-link,link-handover}.svelte`,
  `apps/desktop/src/lib/settings/component/area.svelte`,
  `apps/desktop/src/lib/i18n/{en,ar}/index.ts` and `.../tests/organization.test.ts`,
  `packages/design/src/lib/block/record-card.svelte`.
- Runs, at `ce612e50`:
  - `cargo test -- --test-threads=1` from `apps/desktop/tauri`:
    `test result: ok. 393 passed; 0 failed; 10 ignored; 0 measured; 0 filtered out; finished in 81.09s`.
    The ten ignored are the pre-existing live-Turso tests; the diff adds no `#[ignore]`.
  - `pnpm exec vitest run` over eleven component files from `apps/desktop`:
    `Test Files 11 passed (11)`, `Tests 170 passed (170)`.
  - `node --import tsx --test` over `i18n/tests/organization.test.ts`,
    `organization/tests/{connect,router,setup}.test.ts`, `settings/tests/section.test.ts`,
    `error/tests/tauri.test.ts`: `tests 90`, `pass 90`, `fail 0`, `skipped 0`.
  - `node .aep/scripts/validate.mjs`: `266 artifacts checked, no failures`.
- The root `pnpm test` gate was not run. See *Not checked*.

# Findings

## A. The 22 criteria

Judged against the corrected text where the spec corrects itself. Requirements 3, 6, 7 and 8 carry
dated supersessions or corrections; their criteria, except criterion 4, were never struck to match,
which is recorded under finding E4.

**Criterion 1 (a link carries no legible credential). Met.**

    observation  `link::tests::every_link_names_a_sealed_credential_and_the_half_that_opens_it ... ok`
                 asserts the field set is exactly `credential, half, organizationId,
                 organizationName, remoteUrl, verifyingKey`, that the text contains
                 `"credential":"c2VhbGVk"`, and that it contains no `clear`, no
                 `readOnlyCredential` and no `password`
                 (`apps/desktop/tauri/src/organization/link.rs:514-542`).
    observation  `link::tests::the_payload_opens_on_the_code_and_the_secret_together_and_on_nothing_else ... ok`;
                 `join::tests::the_link_secret_alone_opens_neither_the_payload_nor_the_vault ... ok`;
                 `machine::tests::one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing ... ok`.
    observation  `link.rs:83-95` names the two refusal sentences, `CODE_MISSING` and `CODE_REFUSED`,
                 and records that a link past its moment is refused as a lapsed link before any key
                 is derived. `join::accept` applies them in that order
                 (`join.rs:180-190`).
    observation  connect screen: `the code field is on the form every link is read from, and on no
                 step after it` and `the code field is under the link, six characters, with its own
                 sentence`, both passing.
    conclusion   met.

**Criterion 2 (the credential inside a link lapses within four weeks). Met.**

    observation  `invite::tests::a_link_seals_the_issuers_own_grant_and_lapses_no_later_than_it_does ... ok`
                 loops `("an invitation", &invited)` and `("a reset", &reset)`, asserts the sealed
                 credential is the session's, and asserts
                 `expiry > now && expiry <= now + four_weeks` (`invite.rs:2890-2950`).
    observation  `machine::tests::a_machine_link_seals_the_makers_own_grant_and_lapses_no_later_than_it_does ... ok`
                 is the third kind.
    conclusion   met.

**Criterion 3 (the you section makes a second-machine link). Superseded.**

    source       spec, requirement 3: "*Superseded 2026-09-16 by requirement 20: a link is made by
                 the owner or an administrator from the account's card ... the member's own act in
                 the you section goes.*"
    observation  `another-machine.svelte` is absent from
                 `apps/desktop/src/lib/organization/component/`; `useMakeMachineLink` and
                 `machine.link` are absent from `apps/desktop/src`; `area.svelte.test.ts > the you
                 section offers no link act, and nothing on it hands a link over` passes.
    conclusion   superseded, and the supersession is carried out in the tree.

**Criterion 4 (the sync section still shows the organization link). Superseded.**

    source       spec, criterion 4: "*Superseded 2026-09-16 by criterion 16: the link retires, the
                 sync section shows no link block, and no Rust test connects with one.*" This is
                 the one criterion struck in place.
    observation  `area.svelte.test.ts > the sync section gives the owner the turso account and the
                 disconnect, and no link` passes.
    conclusion   superseded.

**Criterion 5 (what a link is worth, written once). Met.**

    observation  `.aep/rules/credentials.md:82-117` carries *What a link is worth to whoever finds
                 it*, added 2026-09-15 and corrected 2026-09-16.
                 `.aep/contexts/desktop/organization.md:136-161` carries the boundary paragraph,
                 same two dates. 826's requirement 10 carries both corrections
                 (`826/spec.md:152-167`), its requirement 23 the 2026-09-15 one
                 (`:305-317`), and its criterion 10 the 2026-09-16 one (`:355-357`).
    conclusion   met.

**Criterion 6 (the members section as rows with the invite control leading). Superseded.**

    source       spec, requirement 6: "*Superseded 2026-09-16 by requirement 19: the section is a
                 directory of record cards, not a list of rows; ticket 07's rows were built and
                 never looked at.*" Ticket 07 is `status: obsolete`.
    conclusion   superseded; judged under criterion 19.

**Criterion 7 (the workspaces section as rows). Superseded.**

    source       spec, requirement 7: "*Superseded 2026-09-16 by requirement 21: a directory of
                 cards.*" Ticket 08 is `status: obsolete` with every box unticked.
    conclusion   superseded; judged under criterion 21.

**Criterion 8 (the you section states facts and writes on the form surface). Met in its corrected
half; its second clause is superseded and was not struck.**

    source       spec, requirement 8: "*Corrected 2026-09-16 by requirement 20: the second-machine
                 act leaves the you section; the identity block, the password row and the
                 other-machines act stay.*"
    observation  `area.svelte.test.ts > the you section states the password and draws no field
                 until the change control is pressed` passes;
                 `change-password.svelte.test.ts > it is the shared form surface, and a closed one
                 puts nothing in the document`, `> the form asks for the current password and the
                 new one twice, and nothing else`, and `> the floor is explained in a sentence, and
                 there is no meter` all pass.
    observation  `area.svelte.test.ts > the you section offers signing out of other machines,
                 behind one confirm` passes, so the other-machines act stayed.
    interpretation criterion 8's own sentence still asks for "the second-machine control, which on
                 press shows a link with one copy control and a code with none". Requirement 20 and
                 criterion 20 ask for the opposite and the tree does the opposite.
    conclusion   met against the corrected requirement. The criterion's text is stale; see E4.

**Criterion 9 (the workspace menu). Met.**

    observation  `workspace-menu.svelte.test.ts` passes seven tests, including `one row leads to
                 the settings area at the workspaces section` and `nothing in the menu invites
                 anybody or makes a workspace`, whose body asserts `[data-workspace-menu-invite]`,
                 `[data-workspace-menu-create]` and `[data-workspace-menu-invite-refusal]` are each
                 null (`workspace-menu.svelte.test.ts:174-181`).
    conclusion   met.

**Criterion 10 (the two rail menus' casing). Met.**

    observation  `account-menu.svelte.test.ts > the way out is cased like the settings row beside
                 it` and `> signed out, the way in is cased like the settings row beside it` pass.
    observation  the locale half: `i18n/tests/organization.test.ts > each term of requirement 18 is
                 one english key, and its arabic is written` asserts
                 `english['common.actions.signIn'] === 'sign in'` and
                 `english['common.actions.signOut'] === 'sign out'` against the TERMS table at
                 `organization.test.ts:263-265`, which pins both strings lowercase.
    conclusion   met.

**Criterion 11 (the previous link shape is refused). Met.**

    observation  `link::tests::a_link_in_the_previous_shape_is_refused_as_a_link_that_is_not_one ... ok`,
                 refusing on `PREVIOUS_CREDENTIAL_FIELD = "readOnlyCredential"` (`link.rs:80`).
    conclusion   met.

**Criterion 12 (both locales, and the tests that hold the shape). Met, with one gap.**

    observation  every test the plan's *Testing Strategy* names for a live criterion exists and
                 passes; the three runs are in *Sources*. No test in the diff is skipped
                 (`grep` for `.skip(`, `.todo(`, `it.skip`, `test.skip` over
                 `apps/desktop/src/**/*.test.ts` prints nothing), and ticket 03's one skip was
                 restored by ticket 05.
    observation  a key-by-key comparison of `i18n/en/index.ts` against `i18n/ar/index.ts` finds
                 zero keys in one and not the other, and four leaves whose text is identical, all
                 of them pre-dating this effort: `app.name`, `common.formats.csv`,
                 `tenants.form.phoneNumberPlaceholder`, `organization.dashboard.forgetAccountRevokesAt`.
    observation  a changeset is on the branch: `.changeset/a-link-needs-its-code.md` and
                 `.changeset/the-workspace-menu-is-the-workspace-and-the-switch.md`.
    gap          the criterion asks that "the Arabic locale test finds no English string under an
                 Arabic key". No test sweeps the locale for that. The nearest,
                 `each term of requirement 18 is one english key, and its arabic is written`,
                 asserts `at(ar, key) !== term` for ten named terms only
                 (`organization.test.ts:278-296`). What stands in its place is a per-surface
                 assertion in each component test (`and in arabic every card reads in its own
                 words, right to left`, `every sentence this screen added is written in both
                 locales`, and so on).
    conclusion   met on everything but the sweep; the sweep is work nobody built.

**Criterion 13 (the first screen's two ways in). Met.**

    observation  `startup-sign-in.svelte.test.ts > a machine that has joined nothing asks for
                 nothing and offers two ways in, each saying what it needs` passes, and its body
                 loops both locales, asserts exactly two buttons, asserts both description strings
                 are on screen, and asserts the page text contains none of `group`, `database`,
                 `consent` in English and none of `مجموع`, `قاعدة بيانات`, `موافق` in Arabic
                 (`startup-sign-in.svelte.test.ts:171-203`).
    conclusion   met.

**Criterion 14 (the account connects to the organization the group holds). Met.**

    observation  passing: `setup::tests::the_owners_password_connects_this_machine_to_the_organization_the_group_holds`,
                 `an_administrators_password_is_refused_and_the_machine_holds_nothing`,
                 `a_machine_seen_six_days_ago_shuts_the_way_in_and_the_consent_is_let_go_of`,
                 `a_wrong_username_or_password_meets_the_walls_one_sentence`,
                 `the_inspect_says_whether_the_group_already_holds_an_organization`,
                 `a_group_already_holding_an_organization_refuses_the_run_and_gives_the_consent_back`,
                 `a_first_run_creates_the_database_the_keys_the_rows_and_the_link_from_a_name_a_username_and_a_password`.
    observation  the "every grant renewed" clause is asserted, not assumed: `setup.rs:2543-2566`
                 pins the two mints since the consent as
                 `[(HELD_DATABASE, ORGANIZATION_CREDENTIAL_LIFETIME, FullAccess),
                 (HELD_DATABASE, WORKSPACE_CREDENTIAL_LIFETIME, FullAccess)]` with the message
                 "the connect minted its own credential and the renewal did not run", asserts both
                 lifetimes are `"4w"`, and asserts the owner's grant changed.
    observation  the walk: `setup.test.ts > what the consent found decides which step follows it`
                 and `> the connect-existing way is two steps and is not the walk that creates`;
                 `setup-walk.svelte.test.ts > the existing step says one sentence and asks for the
                 username and the password` and `> a refused connect marks the password field and
                 says why under it`.
    observation  the unverified read is pinned to one caller:
                 `store::tests::the_unverified_member_read_has_one_caller ... ok`.
    conclusion   met.

**Criterion 15 (every connected machine is registered). Met.**

    observation  `connect::tests::the_registry_follows_the_machine_through_the_connect_the_two_sessions_and_the_leave ... ok`
                 reads the registry after connect, sign-in, sign-out and disconnect and asserts one
                 row with `member_id == None`, then the member, then none, then no row
                 (`connect.rs:488-532`).
    observation  `store::tests::a_machine_counts_as_connected_for_seven_days_and_carries_the_member_signed_in_on_it ... ok`;
                 `connect::tests::a_record_written_before_the_machine_id_opens_and_carries_an_empty_one ... ok`.
    observation  no signer crosses any of the four writes: `store::register_machine(id, member_id,
                 now)`, `machine_seen(id, member_id, now)`, `unregister_machine(id)` and
                 `connected_machines(organization_verifying_key, now)` take no `Signer`
                 (`store.rs:1365-1425`). The key on the reader is for the member join, not a
                 signature over the machine row.
    observation  `store::tests::the_nine_tables_exist_and_an_organization_holds_two_workspaces_at_once ... ok`.
    conclusion   met.

**Criterion 16 (the organization's own link retires). Met.**

    observation  `grep -rn` over `apps/desktop/tauri/src` finds no `LINK_CREDENTIAL_LIFETIME`, no
                 `Credential::Clear`, and no `"never"`. `link_credential_sealed` survives in three
                 places only: a docstring at `invite.rs:1481`, and a docstring plus the fixture of
                 `store::tests::a_replica_still_carrying_the_link_credential_column_opens_and_reads`
                 at `store.rs:2126-2169`. Ticket 12's Notes records that the grep half and the test
                 half of its criterion cannot both hold literally; the test is the right survivor.
    observation  `link::tests::a_text_with_no_half_and_a_blank_half_are_not_links ... ok`;
                 `connect::tests::a_connect_with_no_credential_in_hand_records_nothing ... ok`.
    observation  `area.svelte.test.ts > the sync section gives the owner the turso account and the
                 disconnect, and no link` passes. `organization-link.svelte` and its test are
                 deleted.
    observation  the connect screen has no code-free path: every landing is behind the paste form
                 that carries both fields. The form does allow an empty code to be submitted
                 (`connect-screen.svelte.test.ts > an empty code still continues, and the link
                 alone is what the form needs`), and Rust then refuses it with `CODE_MISSING`,
                 which is what criterion 1 asks for rather than a way round criterion 16.
    observation  the two dated corrections are in place: `826/spec.md:160-167` on requirement 10,
                 `:355-357` on criterion 10, `organization.md:101-111` and `:136-149`,
                 `credentials.md:105-117`.
    conclusion   met.

**Criterion 17 (one form, the link and its code). Met.**

    observation  passing: `connect-screen.svelte.test.ts > before any link is read the form takes
                 the link and the code, both typed left to right`, `> an invitation link pasted
                 into the field lands on the password step, naming the organization`, `> a machine
                 link connects with no further field, and lands on the wall`, `> text that was not
                 a link keeps the form, says so, and marks the link field`, `> a wrong code and a
                 missing one are each refused by name, and mark the code field`.
    observation  `connect.test.ts > a lapsed, consumed, revoked or replaced link is refused by
                 name, off the code and not the sentence` passes, over the `Refused { reason }`
                 variant `error::tests::a_refused_link_carries_its_reason_beside_the_message`
                 pins.
    conclusion   met.

**Criterion 18 (the owner deletes the organization). Met, with a limit recorded only in a ticket.**

    observation  `removal::tests::the_owner_deletes_every_workspace_then_the_organization_and_keeps_nothing ... ok`
                 and `an_administrator_and_a_wrong_password_are_each_refused_before_anything_is_deleted ... ok`.
                 `removal.rs:342-368` refuses any workspace name that is not a `ws-` database, then
                 deletes each workspace and then `format!("org-{}", session.organization_id)`,
                 both under `DeletionIntent::OrganizationDeletedByHuman`.
    observation  `forget::tests::a_launch_whose_pull_says_the_database_is_gone_forgets_the_organization ... ok`,
                 over `sync::turso::platform::tests::a_database_that_is_not_there_is_told_from_a_credential_and_from_a_remote_that_answered_nothing ... ok`,
                 which is the 404-only sign.
    observation  `area.svelte.test.ts > the owner is offered the delete, on a surface that says what
                 goes and takes the password` and `> an administrator is offered no delete, because
                 the block it sits in is the owners` pass.
    limit        ticket 13's Notes, *Raised, carried to the close*: a machine sitting at the wall at
                 launch reaches no organization database, so it learns the organization is gone one
                 launch after the sign-in whose pull fails. The spec's *Risks* does not carry this.
    conclusion   met; the limit is real and is recorded in a ticket rather than in the spec.

**Criterion 19 (the members section as a directory of accounts). Met against the corrected
requirement; the criterion's own act-list clause is not met for two acts.**

    observation  `members.svelte.test.ts` passes 22 tests, among them `one card is drawn per
                 account, in the order the list answers them`, `each card says where its account
                 stands, in one of three lines`, `the section says who is listed and what it is
                 for, in the tray`, `the add control stands in the tray before the first card and
                 asks the shell for the form`, `the owner card carries an administrator nothing,
                 and is drawn with no menu`, `the owner card offers the owner the transfer alone`,
                 `a reader meets no edit on their own card` (whose body asserts `control('ada')` is
                 null and `actsOn('ada')` equals `[]`), `each act is drawn by its own act and by no
                 other`, `a card opens its own record, and nothing on the card itself does anything
                 else`.
    observation  `area.svelte.test.ts > a plain member is offered every section but members` is the
                 member session's case.
    observation  the Rust half: `invite::tests::an_account_is_made_with_no_link_and_its_first_link_sets_its_password ... ok`
                 and `invite::tests::a_standing_is_the_password_and_the_register_read_together ... ok`.
    observation  the card's menu, read off `members.svelte:393-502`, carries `data-member-transfer`,
                 `-rename`, `-role`, `-access`, `-link`, `-unset-password`, `-end-sessions`,
                 `-remove`, `-lock-out`. There is no `data-member-revoke` and no copy-link entry.
    gap          criterion 19 asks for "every act of 826's requirement 15 present or absent on the
                 card's menu by the same gates". Revoke and copy link are absent unconditionally
                 rather than by a gate. Requirement 19's own act list does not name either, so the
                 requirement is met and the criterion's wording is not. The only record of the
                 decision is ticket 15's Notes.
    observation  lock out is now a menu entry of its own with the route's confirm behind it
                 (`members.svelte:493-501`), not an option inside the remove dialog.
    conclusion   met against requirement 19 as corrected; see E2 for the revoke question in full.

**Criterion 20 (a link is the one way a machine joins an account). Met.**

    observation  passing: `invite::tests::an_account_is_made_with_no_link_and_its_first_link_sets_its_password`,
                 `invite::tests::a_machine_signed_in_is_refused_a_link_and_a_reset_makes_the_next_one_ask_a_password`,
                 `machine::tests::a_link_for_an_account_with_a_password_lands_at_the_wall_where_that_password_admits`,
                 `machine::tests::one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing`.
    observation  the gate matches the corrected criterion: `invite::make_link` bars a link only
                 where `!member.must_change_password` and the register shows a machine on the
                 account (`invite.rs:454-466`), so an account with no password is offered a link
                 even while a machine is signed in. Ticket 14's Notes records the child raising the
                 unqualified reading and the requirement winning.
    observation  `connect-screen.svelte.test.ts` shows the choose-password fields for the first
                 kind and the wall for the second; `area.svelte.test.ts > the you section offers no
                 link act` is the third clause.
    observation  the reset is now `invite::unset_password`, and the substitution works both ways:
                 a fresh link for an unset account calls `reseal_account`
                 (`invite.rs:478-479`), which draws a new vault password, so any earlier
                 invitation link stops opening the vault; a fresh link for a set account calls
                 `store.delete_open_machine_links_of(member_id)` (`invite.rs:509`), so one machine
                 link stands at a time.
    conclusion   met.

**Criterion 21 (the workspaces section as a directory of workspaces). Met.**

    observation  `workspaces.svelte.test.ts` passes 18 tests, among them `one card is drawn per
                 workspace, carrying its name and how many hold it`, `the open one is marked by a
                 disc carrying its word, and no card says an access`, `the section says what it is
                 for, in the tray above the cards`, `new workspace stands in the tray for the owner
                 holding the authority, and opens the shell dialog`, `an owner whose machine lost
                 the authority reads why in the tray, and everybody else is offered neither`, `an
                 owner holding every gate is offered members and delete on each card, and rename on
                 the open one`, `each act is drawn by its own gate and by no other`, `export and
                 import sit beneath the cards, under a legend naming the open workspace`.
    observation  the human's look is recorded with their words in ticket 16's Notes: the access
                 line left the card and the open one carries one quiet mark, then "Looks right,
                 resolve 16".
    conclusion   met.

**Criterion 22 (ownership is transferred). Met.**

    observation  passing: `role::tests::a_transfer_swaps_the_roles_and_every_row_still_verifies_against_the_unchanged_key`,
                 `role::tests::the_old_owner_cannot_transfer_again_and_an_administrator_never_could`,
                 `role::tests::a_member_given_the_organization_is_certified_by_the_transfer`,
                 `role::tests::the_refusals_come_before_any_write`,
                 `setup::tests::the_new_owner_connects_a_fresh_machine_by_the_seed_the_transfer_sealed`,
                 `authority::tests::a_member_row_without_the_owner_seed_signs_the_bytes_it_signed_before_the_column`,
                 `authority::tests::a_member_row_carrying_the_owner_seed_folds_it_into_what_it_signs`,
                 `store::tests::a_member_row_with_the_owner_seed_and_one_without_both_read_back_verified`.
    observation  `members.svelte.test.ts > the transfer opens a heavy form surface naming what
                 changes and taking the password`, `> the transfer is on the owner own card and on
                 no other`, `> an administrator meets no transfer on the owner card`, `> a refused
                 transfer marks the password and the surface stays open`; and
                 `area.svelte.test.ts > an owner holding no authority is told the authority follows
                 the account that consented` with its paired absence test.
    conclusion   met.

**Tally: 18 met, 4 superseded (3, 4, 6, 7), 0 not met.** Two of the eighteen carry a named gap
(12 and 19) and one is met only in its corrected half (8).

## B. The acts 826's requirements 15 and 16 gate

    observation  members card (`members.svelte:393-502`), every entry gated as before:
                 rename `data-member-rename`, role and permissions `data-member-role`, workspaces
                 and access `data-member-access`, the way in `data-member-link`, reset the password
                 `data-member-unset-password`, sign out everywhere `data-member-end-sessions`,
                 remove `data-member-remove`, lock out `data-member-lock-out`, transfer
                 `data-member-transfer`. Each is pinned by
                 `members.svelte.test.ts > each act is drawn by its own act and by no other`.
    observation  workspaces card: rename, members and delete are each present behind their gate,
                 pinned by `workspaces.svelte.test.ts > an owner holding every gate is offered
                 members and delete on each card, and rename on the open one` and `> each act is
                 drawn by its own gate and by no other`; new workspace is in the tray.
    observation  **absent: revoke, and copy link.** There is no `data-member-revoke` and no
                 copy-again control anywhere in `apps/desktop/src`.
    observation  where the absence is recorded: ticket 15's Notes, *2026-09-16, at integration* only.
                 "revoke left the section, since requirement 19's menu does not list it (a stale
                 link is superseded by resetting the password or making a new link; the Rust act
                 and its hook stay)" and "`invitation_link`, `invitation.link` and
                 `useInvitationLink` were removed from the boundary". Neither the spec nor
                 826's requirement 15 was corrected.
    interpretation revoke's substitute holds on the admission axis. Making a fresh link for an
                 unset account reseals the vault, so the earlier link's sealed password no longer
                 opens it and `join::accept` refuses at `open_vault` with the named sentence
                 (`join.rs:240-241`); making one for a set account deletes the open machine-link
                 rows (`invite.rs:509`). Neither costs a round trip to anybody.
    interpretation revoke never bounded the credential axis, before or after. The payload's
                 organization credential is unsealed from the link's own text before any row is
                 read (`join.rs:187-196`), so deleting the invitation row never took it back. What
                 bounds it is the four-week lapse of requirement 2.
    conclusion   every act 826's requirements 15 and 16 gate is still reachable except revoke and
                 copy link, both deliberately dropped, both recorded only in a ticket Note. The
                 one thing an owner cannot now do is cancel a link they just made without making
                 another one.

## C. Sentences the branch made false

### C1. `.aep/contexts/desktop/organization.md`

    source       line 19-22, *Organization*: "holding nine tables: ... the migration lease, **the
                 machine links a member makes for their own next machine**, and the register of the
                 machines that hold the organization."
    observation  the count is right (`store::TABLES: [&str; 9]`, and
                 `the_nine_tables_exist_and_an_organization_holds_two_workspaces_at_once ... ok`).
                 The description is not: `machine::make` is gone and the one act that makes a link
                 of either kind is `invite::make_link` (`invite.rs:427`), gated on
                 `Administration::InviteMember` and refused on the owner's own row
                 (`invite.rs:443-448`). A member makes nothing.
    conclusion   false, and no dated correction covers it.

    source       line 171-176: "**The owner's machine is the only one with the Turso authority**,
                 and the acts that need it, creating and deleting workspaces, minting read-only
                 grants, renewing credentials, locking out, are refused for everybody else."
    observation  deleting the organization joins that list (`removal::delete_organization`,
                 `removal.rs:298`, owner only).
    conclusion   incomplete rather than wrong; the list is now short by one.

    source       line 196-199: "**Only the owner can**, because only their password **re-derives**
                 the organization key."
    observation  a transferee's password does not re-derive it; `setup::owner_key_from` reads
                 `member.owner_seed_sealed` first and derives only where there is none. The
                 *Authority* correction of 2026-09-16 (`:118-128`) says exactly this and names the
                 *Chain* entry as what it re-reads, not this boundary bullet.
    conclusion   false of a transferee; the correction exists in the file but does not reach this
                 sentence.

### C2. `.aep/rules/credentials.md`

    source       line 90 names three kinds. "**Every other link**", glossed as "an invitation, **a
                 reset**, and the second-machine link effort 828 adds", "carries no legible
                 credential at all".
    observation  there are two kinds, `HalfKind::Invitation` and `HalfKind::Machine`
                 (`link.rs:98-106`). A reset is `invite::unset_password` and makes no link; what
                 follows it is an ordinary link chosen by the account's standing.
    conclusion   false, and the 2026-09-16 correction below it (`:105-117`) does not say so.

    source       line 72-80, the 2026-09-15 correction: the code "crosses out of `member_invite`,
                 `member_reset` and `invitation_code`" and "lapses ninety seconds after it is
                 made".
    observation  both are corrected by the later paragraph in the same file: ":99-103" says one code
                 per link, lives as long as the link, and "those three commands are gone, and a
                 code crosses out of `member_link_make` alone", which matches
                 `lib.rs:255 organization::member_link_make`.
    conclusion   carried by a dated correction; not listed as an uncarried falsehood.

### C3. `.aep/references/turso.md`

    source       line 25-27: "**The organization's own directory is on Turso as well, and it does
                 not come through this API either.** `org-<id>` is an ordinary database every
                 member's machine keeps a replica of; **all this API did for it was create it
                 once**, and everything after that is the sync engine's."
    observation  false twice over now. `setup::connect_existing` mints a full-access four-week
                 token for the held `org-<id>` on the Platform API, pinned by the two-mint
                 assertion at `setup.rs:2543-2559`; and `removal::delete_organization` deletes
                 `org-<id>` through `delete_database` (`removal.rs:355-370`).
    observation  the same file's *Never run* does carry the delete, dated 2026-09-16
                 (`turso.md:288-291`), so the file disagrees with itself.
    conclusion   false, and the correction that exists sits three sections away from the sentence
                 it contradicts.

    source       line 19-22, *Purpose*: "Two things, and neither is in the data path: creating the
                 database a workspace's data lives in, and minting the short-lived token a client
                 syncs with."
    observation  deleting is a third and was so before this branch; the branch widens it from `ws-`
                 to `org-`.
    conclusion   already loose; widened by this branch rather than broken by it.

### C4. `.aep/efforts/826-.../spec.md`

Only requirement 10, requirement 23 and criterion 10 carry a dated correction. Each sentence below
is false at `ce612e50` and carries none.

    source       R5: "The acts that need the Turso authority ... the Turso account itself, **and
                 the organization's own link**." There is no such link.
    source       R8: "what it produces is **a single `rentable://` link** and the sentence that
                 rentable cannot send it"; and "**the pending row offers it to copy again** until
                 then, to the person who issued it". `member_create` returns a `Member` and no
                 link; nothing in `apps/desktop/src` copies a link a second time.
    source       R9: "**A reset is a fresh link.** A holder of `resetPassword` issues a member a
                 new link." A reset is `member_password_unset` (`resetPassword`); the link is a
                 separate act, `member_link_make` (`inviteMember`).
    source       R12: "The password is asked again **only to change it**." It is also asked to
                 delete the organization (`organization_delete`) and to transfer ownership
                 (`member_transfer_ownership`).
    source       R14: the sync section's contents, "... the Turso account with reconnect and
                 forget, **the organization link**, disconnect this machine".
    source       R15: "for an invited person who has not yet signed in **a pending mark with the
                 expiry**" (it is one of three standing lines now); "Remove asks once and **offers
                 lock out in the same dialog**" (two menu entries, each with the route's confirm);
                 "**a pending row offers copy link to its issuer, new link, and revoke**, and
                 revoking a person who never signed in removes them".
    source       R17: "The workspace menu keeps the switcher and offers workspaces **and invite**."
                 828's requirement 9 says this requirement "is corrected"; nothing was written into
                 826's spec.
    source       R18: "`invitation link` **and `organization link`** are the two links."
    source       R20: "the Rust model tests cover ... **the reset link**".
    source       C8: "**`member_invite(username, role, workspaces)` returns one link** and no
                 password"; "the invite dialog's test finds one copy control".
    source       C15: "The members section's test **renders an active row and a pending row**".
    source       C17: "The workspace menu's test finds ... **an invite row opening the dialog**."
    source       C23: "**`member_invite` and `member_reset` answer a link and a six-character code
                 with its expiry ninety seconds out; `invitation_code` answers a fresh one** to the
                 issuer". R23 carries the ninety-second correction; C23 does not.
    source       Risks: "The invite result says to hand it over the way you would a password;
                 **revoke is one press away**."; and "**The code is a second thing to hand over,
                 and it hurries the person. Ninety seconds is a call** ... a fresh one is one press
                 away". The 2026-09-15 correction sits on R23 and not on either risk.

### C5. 828's own spec contradicts itself

    source       R15: "the registry gates requirement 14 alone; **nothing else reads it**."
    source       Out of Scope: "**A registry that anything but the connect-existing gate reads**:
                 no list of machines in the settings area, no signing a machine out by name. The
                 registry exists to answer one question."
    observation  `store::connected_machines` has four shipping readers: `setup.rs:986` (the
                 connect-existing gate), `invite.rs:456` (the link gate of requirement 20), and
                 `invite.rs:975` and `invite.rs:1589` (the standings requirement 19's card draws).
    conclusion   false; requirements 19 and 20 made them so and neither carries a note saying it.

    source       Out of Scope: "**An administrator making or viewing a second-machine code for a
                 member.** A reset exists for a member who lost every machine, and a member with a
                 machine makes their own."
    observation  requirement 20 is exactly that act, and `invite::make_link` builds the
                 machine-kind link for a holder of `inviteMember`. The 2026-09-16 correction in Out
                 of Scope is on a different entry (*New acts, new roles or new access levels*).
    conclusion   false.

## D. Dead surface

Each with its one remaining reader, where there is one.

    1. `useRevokeInvitation` (`apps/desktop/src/lib/organization/query.ts:525`). **No reader.** It
       is the only hook in that file with none; the other 27 each have at least two.
    2. `invitation.revoke` router procedure (`organization/router.ts:398`). One reader,
       `useRevokeInvitation`, which is itself unread.
    3. `host.organization.invitation.revoke` (`platform/tauri.ts:282`) and its stub
       (`platform/tests/testing.ts:160`). Read by the router procedure alone.
    4. `invitation_revoke` (`tauri/src/organization/command.rs:1537`), registered at
       `lib.rs:266`. Reachable only through the chain above, which terminates in nothing.
    5. `invite::invitation_link` (`tauri/src/organization/invite.rs:771`). **Registered by no
       command**: `grep invitation_link` over `lib.rs` and `command.rs` prints nothing. Its only
       callers are its own tests (`invite.rs:3026`, `:3073`, `:3081`). It is also the one reader of
       the issuer's copy in `invitation.sealed_secret`, which is what ticket 15's Notes meant by
       keeping "the Rust reader of the issuer copy ... as the column's one reader".
    6. `PendingInvitation` (`platform/host.ts:366`, `tauri/src/organization/invite.rs:861`) and
       `MemberFacts.pending` (`host.ts:388`, `invite.rs:886`). **No reader on the web side**: no
       `.svelte` under `organization/component`, `settings/component` or `routes` reads `.pending`;
       `members.svelte.test.ts:111` and `router.test.ts:193,470` set it to `null` as fixture. In
       Rust it is read at `invite.rs:2560` and by tests.
    7. `link-handover.svelte` is not dead but has lost its reason. It was extracted in ticket 06 so
       that two hosts could share it; both hosts (`invite-form.svelte`, `another-machine.svelte`)
       are deleted, and its one consumer is now `made-link.svelte:76`.

    observation  nothing else is dead. Every other router procedure has a reader; every English
       locale key under `organization.`, `layout.` and `settings.` has a reader except
       `organization.dashboard.forgetAccountRevokesAt`, which pre-dates this effort and is read by
       `i18n/tests/organization.test.ts:63`. `RecordCardAction`'s two new fields both have live
       consumers (`members.svelte:402,455,466,476` for `disabled`; `members.svelte` and
       `workspaces.svelte` for `attributes`).

## E. The changeset, and what the whole diff shows

### E1. `.changeset/a-link-needs-its-code.md`

Eleven paragraphs. Nine describe the branch. Two do not.

    source       paragraph 2 (line 7), in full: "a signed-in member connects their own next
                 machine: from their own machine they make a link and a six-character code ..."
    observation  false in every clause. The act was built by ticket 04 and retired by ticket 14;
                 `another-machine.svelte`, `machine_link_make`, `machine.link` and
                 `useMakeMachineLink` are all gone. Paragraph 9 of the same file (line 21) says so
                 outright: "The second-machine control in the you section is gone with it: a member
                 is given a link by whoever keeps the accounts." The changeset contradicts itself.
    source       paragraph 4 (line 11): "... **and connecting another machine of your own sits
                 under its own heading beside signing out of the others**."
    observation  false, same reason. The rest of that paragraph (the password row, the sync section
                 showing no link, the owner getting back in with the Turso account) is true.
    source       paragraph 1 (line 5): "every invitation **and reset link** now needs the
                 six-character code".
    observation  there is no reset link any more. The sentence is true of the two kinds that exist
                 and names a third that does not.
    conclusion   ticket 12 cut this paragraph's naming of the recovery copy; ticket 14 retired the
                 member's own act and did not come back for paragraphs 2 and 4.

### E2. What the tickets claimed and the tree says otherwise

    observation  ticket 12's evidence reads "`dashboard.linkTitle` [is] absent from
                 `apps/desktop/src`". It is present at `ce612e50`
                 (`i18n/en/index.ts:844`, `ar/index.ts:807`). `git show a5155f13` removed it as
                 "organization link" with the sync section's block, and a later commit re-created
                 the same key with a new meaning, "link and code", for `made-link.svelte:73`. The
                 i18n term test now pins the new meaning
                 (`organization.test.ts:268`). The ticket's claim was true of its own commit.
    observation  ticket 02's claim that `organization-dialogs.svelte` is unchanged is true of
                 ticket 02's diff only; ticket 03's Notes says so, and the file is +124/-? across
                 the branch.
    conclusion   no ticket claim was found false of the commit it was written against. Two are
                 false of the tip and say so in a neighbouring Note.

### E3. Names that drifted, and helpers built then removed

    observation  the plan names `link::make_for`; the tree has `invite::make_link`
                 (`invite.rs:427`).
    observation  built then retired inside the branch, so absent from `f56ac57a..HEAD` entirely:
                 `packages/design/src/lib/block/row-actions.svelte` and its test (ticket 07, cut by
                 ticket 15), `another-machine.svelte` and `machine::make`/`machine_link_make`
                 (ticket 04, cut by ticket 14), `invite-form.svelte` (replaced by
                 `account-form.svelte` plus `made-link.svelte`).
    observation  `members.svelte` and `workspaces.svelte` each write their own card loop over
                 `RecordCard` rather than reusing `complex/component/directory.svelte`, which the
                 plan named as the shape. They do share `directory-tray.svelte` and
                 `settings/section.ts`'s `recordOf`. Both files' docstrings say the shape is the
                 complex directory's; the code is a second copy of the arrangement, not of a
                 helper.
    conclusion   no helper is written twice. One layout arrangement is.

### E4. The spec's criteria were not corrected with its requirements

    observation  requirements 3, 6, 7 and 8 carry dated supersessions or corrections. Of their four
                 criteria, only criterion 4 (superseded by 16) was struck in place. Criteria 3, 6
                 and 7 and the second clause of criterion 8 still ask for what the tree correctly
                 does not do.
    observation  criterion 19 still routes through "every act of 826's requirement 15", which
                 includes revoke and copy link.
    conclusion   a reader who checks the branch against the criteria alone, without reading the
                 requirements, will read four false failures and one real gap.

### E5. A permission consequence nothing records

    observation  `member_password_unset` is gated on `resetPassword` and `member_link_make` on
                 `inviteMember` (`router.test.ts > making an account is inviteMember and unsetting
                 a password is resetPassword`, `> making a link is held to inviteMember`).
    interpretation before this branch, `resetPassword` alone got a member back in, because a reset
                 was a fresh link (826, requirement 9). Now a member widened with `resetPassword`
                 and not `inviteMember` can take a password away and cannot hand out the link that
                 restores it. Owners and administrators hold both by default, so the default roles
                 are unaffected; a widened plain member is not.
    conclusion   a real behavioural narrowing, following from requirement 20 as written, recorded
                 in neither the spec nor a ticket.

### E6. The you section's look

    observation  the spec's *Constraints*: "**The look is judged on the real organization.** Every
                 reshaped section is checked against real rows before it is accepted." Tickets 15
                 and 16 record the human's looks with their words; ticket 11 records one on the
                 first screen. Ticket 06's Notes leans on the dev build launched for ticket 07.
    observation  ticket 14 then took the another-machine block out of the you section, and no
                 ticket records a look at the section after that.
    conclusion   the you section, in the shape it ships in, was not looked at on the real
                 organization by anybody who recorded it.

# Conclusion

At `ce612e50` the branch meets 18 of the 22 criteria and supersedes 4 (3, 4, 6, 7), with nothing
outright unmet. Every test the plan's *Testing Strategy* names for a live criterion exists and
passes: 393 Rust tests, 170 component tests over eleven files, 90 node tests over six.

Two gaps are work nobody built rather than an approach that cannot satisfy the requirement. The
first is criterion 12's Arabic sweep, for which no test exists; per-surface Arabic assertions stand
in its place. The second is revoke: the act, its command, its router procedure and its hook all
survive with nothing calling them, and the decision to drop it from the members card lives only in
ticket 15's Notes. Neither is a gap the approach forces; both are a line of work and a line of prose.

Three sentences outside 826's spec are now false and carry no correction: one in the organization
context (what makes a machine link), one in the credentials rule (three kinds of link where there
are two), and one in the Turso reference (what the Platform API does to `org-<id>`). Inside 826's
spec there are fifteen: requirements 5, 8, 9, 12, 14, 15, 17, 18 and 20, criteria 8, 15, 17 and 23,
and two risks. Section C lists each with the words that are wrong. 828's own spec contradicts itself in three places: requirement 15 and two Out of Scope
entries. The changeset carries one wholly false paragraph and one false clause, both about the
member's own second-machine act that ticket 14 retired.

These are findings. What to correct, what to build and what to accept as recorded is the
orchestrator's.

# Not checked

- The root `pnpm test`, `pnpm check` and `pnpm lint` gates were not run; the brief ruled out the
  root scripts. The tickets record each passing at its own commit, and I ran the component and
  node test files directly instead.
- `cargo fmt --check` was not run. Ticket 10's Notes records it failing on this tree with 35 hunks
  that pre-date the effort and are not in the lint gate; whether that is still 35 was not measured.
- The ten ignored Rust tests reach a live Turso account and were not run, as the brief requires.
- No screen was driven. Every claim about what a surface renders is read off a passing component
  test or the component source, never off a running build. The human's looks are cited from ticket
  Notes.
- Whether a real Turso database deleted on the account answers 404 is still unrun, by ticket 13's
  own record and the Turso reference's *Failure handling*.
- I did not read `.aep/rules/{interface,frontend,module-layout,testing,version-control}.md`, so no
  finding here judges the branch against them. That is the standards reviewer's ground.
- `.aep/index.md`'s currency was not verified, because regenerating it writes. `validate.mjs`
  printed `266 artifacts checked, no failures`.
- Test files outside the organization, layout, settings and i18n areas were not run, so a
  regression this branch caused elsewhere in `apps/desktop` would not have been seen here.
