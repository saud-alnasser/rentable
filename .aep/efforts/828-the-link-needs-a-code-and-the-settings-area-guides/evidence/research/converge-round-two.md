---
use-when: "judging whether effort 828's branch is done after round one's two cut tickets landed, or deciding what its close still has to carry"
---

# Question

At `6d152316`, with tickets 18 and 19 landed and the spec's own contradictions corrected, does the
branch meet every live acceptance criterion, close both gaps round one named, leave nothing newly
false in the artifacts it touches, and leave no dead surface?

# Sources

Read on 2026-09-16 in the run's worktree
(`.aep/worktrees/828-the-link-needs-a-code-and-the-settings-area-guides/_run`), on branch
`graphite/docs/828-the-link-needs-a-code-and-the-settings-area-guides` at `6d152316`. The tree was
read only; `git status --porcelain` was empty before and after, and nothing was run that writes to
it.

- `.aep/efforts/828-.../evidence/research/converge-round-one.md`, entire. Its long reading was
  treated as a claim to re-confirm at this tip, not re-derived.
- `.aep/efforts/828-.../spec.md` as it now stands, entire. Every criterion is judged against the
  corrected text: criteria 3, 6, 7 and the second clause of 8 now carry dated supersessions,
  criterion 19 carries a dated correction written at converge, requirement 15 carries one, two Out
  of Scope entries carry one, and *Risks* carries the `resetPassword` entry round one's E5 raised.
- `.aep/efforts/828-.../plan.md`, *Testing Strategy*, for which tests each criterion is checked by.
- Tickets `18-the-dead-surface-goes-and-the-arabic-sweep-exists.md` and
  `19-what-the-branch-falsified-is-corrected.md`, both `status: resolved`, with their ticked
  evidence and Notes. The ticks were treated as claims.
- `git show c36b8dae` and `git show 6d152316`, both in full (7 files and 23 files).
- `.aep/contexts/desktop/organization.md`, `.aep/rules/credentials.md`, `.aep/references/turso.md`,
  `.aep/efforts/826-.../spec.md` and `.changeset/a-link-needs-its-code.md`, each read as it now
  stands.
- Source, not summaries: `apps/desktop/tauri/src/organization/{store,forget,invite,join,link,
  session,role,removal,setup,machine,connect,authority}.rs`, `apps/desktop/tauri/src/lib.rs`,
  `apps/desktop/tauri/src/error.rs`, `apps/desktop/src/lib/organization/{query,router}.ts`,
  `apps/desktop/src/lib/organization/component/{members,workspaces,connect-screen,made-link,
  link-handover}.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts` and
  `apps/desktop/src/lib/i18n/tests/script.test.ts`.
- `turso_core-0.8.0-pre.7` from the cargo registry, for finding G: `connection.rs:431-433` and
  `translate/emitter/mod.rs:111-126`.
- Runs at `6d152316`, in this worktree:
  - `cargo test -- --test-threads=1` from `apps/desktop/tauri`, with `CARGO_TARGET_DIR` on the main
    checkout's target:
    `test result: ok. 391 passed; 0 failed; 10 ignored; 0 measured; 0 filtered out; finished in 73.73s`.
    The ten ignored are the pre-existing live-Turso tests.
  - `pnpm exec vitest run` over the eleven component files from `apps/desktop`:
    `Test Files 11 passed (11)`, `Tests 170 passed (170)`.
  - `node --import tsx --test` over `i18n/tests/{organization,script}.test.ts`,
    `organization/tests/{connect,router,setup}.test.ts`, `settings/tests/section.test.ts`,
    `error/tests/tauri.test.ts`: `tests 93`, `pass 93`, `fail 0`, `skipped 0`.
  - `node .aep/scripts/validate.mjs`: `269 artifacts checked, no failures`.
- The root `pnpm test`, `pnpm check` and `pnpm lint` gates were not run. See *Not checked*.

# Findings

## A. Round one's two gaps

**Gap 1, criterion 12's Arabic sweep. Closed.**

    observation  `apps/desktop/src/lib/i18n/tests/script.test.ts` is new in `6d152316`, 109 lines,
                 three tests. `leaves()` walks every leaf of both dictionaries by dotted path;
                 `written()` strips `{...}` placeholders innermost outward, lowercases, and then
                 removes six allowed tokens, each with a sentence saying why it is allowed
                 (`app.turso.tech`, `rentable`, `turso`, `developer`, `csv`, `xxxxxxxx`).
    observation  `every arabic string is written in arabic` fails on any remaining `[a-z]`;
                 `every english string is written in english` fails on any `[؀-ۿ]`;
                 `the sweep catches a copied sentence in either direction` proves the detector
                 bites in both directions rather than passing vacuously.
    observation  all three pass in the run above (`tests 93`, `pass 93`, `fail 0`), so both locales
                 are clean as they stand.
    interpretation criterion 12's words are "the Arabic locale test finds no English string under an
                 Arabic key". That is exactly the first test. The gap is work that was missing and
                 is now built.
    limit        the allowance is a substring removal applied to every key, so `developer` or `csv`
                 anywhere in an Arabic sentence costs nothing wherever it appears, not only in the
                 key that earned the allowance. That is a looseness in the guard, not a failure of
                 the criterion.
    conclusion   closed, by `script.test.ts` and its three passing tests.

**Gap 2, the revoke surface with nothing calling it. Closed.**

    observation  `grep -rn` over `apps/desktop/src`, `apps/desktop/tauri/src` and `packages` for
                 `useRevokeInvitation`, `invitation_revoke`, `invitation.revoke`,
                 `PendingInvitation`, `invitation_link` and `revoke_invitation` prints nothing. The
                 only surviving use of the word in Rust is two lines of comment at
                 `invite.rs:662-663`.
    observation  `git show 6d152316` removes `issuers_copy` and `split_issuer_copy` from
                 `invite.rs`, four tests (`the_issuer_copies_the_link_and_the_code_again_and_nobody_else_can`,
                 `revoking_a_reset_link_deletes_the_row_alone_and_keeps_the_member`, and two that
                 were renamed) and adds two (`an_invitation_lapses_and_is_reissuable_while_the_link_stands`,
                 `a_link_whose_invitation_row_is_gone_is_refused_and_lands_at_the_wall`). Net minus
                 two, which is the 393 of round one becoming the 391 of this run.
    observation  the `Revoked` refusal keeps its coverage: `join.rs:90,104,190,216,232,235` still
                 produce it, `connect-screen.svelte:154-155` still reads
                 `organization.join.revoked`, and `error/tauri.ts:36` still lists `revoked` among
                 the four refusal reasons.
    observation  `invitation.sealed_secret` stays as a column, with the docstring the ticket asked
                 for (`store.rs:276-279`): "**It has no reader yet.** The act that opened it ...
                 went with effort 828, which found nothing calling it."
    conclusion   closed, by the diff of `6d152316` and by the greps above.

## B. The sentences round one listed as false

### B1. `.aep/contexts/desktop/organization.md`

    observation  the *Organization* entry's "the machine links a member makes for their own next
                 machine": corrected in place at `organization.md:27-34`, dated 2026-09-16, naming
                 requirement 20, leaving the old sentence standing. It says the count is still
                 nine, that `machine_link` is still a table, that `invite::make_link` is the one
                 act, and that the ninth table `machine` is requirement 15's register.
    observation  each claim in that correction holds: `store::TABLES: [&str; 9]` lists
                 `machine_link` and `machine` (`store.rs:45-55`), and `invite::make_link` requires
                 `Administration::InviteMember` and refuses the owner's row with "an owner is
                 handed no link" (`invite.rs:433-445`).
    observation  the boundary bullet "only their password re-derives the organization key":
                 corrected at `organization.md:208-213`, dated 2026-09-16, naming requirement 22,
                 and pointing at `setup::owner_key_from` reading `member.owner_seed_sealed` first,
                 which is what `setup.rs:141-143` does.
    **still uncorrected**  the Turso-authority list at `organization.md:180-185` still reads
                 "creating and deleting workspaces, minting read-only grants, renewing and rotating
                 credentials, locking out", and deleting the organization
                 (`removal::delete_organization`, owner only) is not on it. Round one called this
                 "incomplete rather than wrong", ticket 19's criterion did not enumerate it, and
                 nothing added it. The list is still short by one.

### B2. `.aep/rules/credentials.md`

    observation  "an invitation, a reset, and the second-machine link effort 828 adds" as three
                 kinds: corrected at `credentials.md:113-123`, dated 2026-09-16, naming requirement
                 20, saying there are two, `HalfKind::Invitation` and `HalfKind::Machine`, and that
                 `invite::unset_password` held to `resetPassword` makes no link.
    observation  both hold in the tree (`link.rs:98-106`; `lib.rs:256 member_password_unset`).
    observation  the 2026-09-15 ninety-second paragraph was already carried by a later dated
                 correction in the same file; round one did not list it as uncarried, and nothing
                 changed.
    conclusion   the one uncarried falsehood in this file now carries a correction.

### B3. `.aep/references/turso.md`

    observation  "all this API did for it was create it once": corrected at `turso.md:30-39`, dated
                 2026-09-16, naming requirements 14 and 18, saying the API creates `org-<id>`,
                 mints over it and deletes it, and that the reads and writes between are still the
                 sync engine's. Both halves check out
                 (`setup::connect_existing`'s two mints; `removal.rs` deleting `org-<id>` through
                 `delete_database`).
    **still uncorrected**  *Purpose* at `turso.md:17-22` still opens "Two things, and neither is in
                 the data path", and deleting is a third. Round one called it "already loose;
                 widened by this branch rather than broken by it", and ticket 19's criterion did not
                 name it. The new paragraph three lines below does say the API deletes, so the file
                 answers the question correctly for anybody who reads past the heading.

### B4. `.aep/efforts/826-.../spec.md`

    observation  every one of round one's fifteen now carries a dated 2026-09-16 correction naming
                 effort 828 and the requirement, with the old sentence left where it stood:
                 requirement 5 (`:110`), 8 (`:150`), 9 (`:166`), 12 (`:210`), 14 (`:257`),
                 15 (`:272`), 17 (`:295`), 18 (`:316`), 20 (`:339`); criterion 8 (`:427`),
                 15 (`:466`), 17 (`:479`), 23 (`:510`); and the two risks (`:612`, `:626`).
                 Requirement 10 and criterion 10 already carried ticket 12's, which stand.
    observation  fifteen of fifteen. Nothing round one listed is left without one.

### B5. 828's own spec contradicting itself

    observation  requirement 15's "nothing else reads it" now carries *Corrected 2026-09-16: the
                 members directory reads it too, for the standing line and the link act's gate
                 (requirements 19 and 20); nothing lists machines and nothing acts on one.* That
                 matches the tree: `store::connected_machines` is read at `setup.rs` (the
                 connect-existing gate), `invite.rs:452` (`make_link`'s gate) and
                 `invite.rs:779` (`standings`), and nothing lists a machine or acts on one.
    observation  the Out of Scope entry on the registry carries the same correction; the Out of
                 Scope entry "An administrator making or viewing a second-machine code for a
                 member" carries *Withdrawn 2026-09-16 by requirement 20*.
    observation  criterion 19's act list carries the correction written at converge, so the revoke
                 and copy-link mismatch round one found between the criterion and requirement 19 is
                 resolved in the criterion's own text.
    observation  the `resetPassword`-without-`inviteMember` narrowing round one raised as E5 is now
                 a *Risks* entry, *Found 2026-09-16 at converge*, recorded rather than changed.
    conclusion   all three contradictions round one named are corrected.

### B6. What the two new commits themselves made false

    observation  I read every paragraph `c36b8dae` added and checked each claim against the tree.
                 None is false. The load-bearing ones, checked individually: nine tables with
                 `machine_link` and `machine` among them; `invite::make_link` gated on
                 `inviteMember` and refused on the owner's row; `setup::owner_key_from` reading the
                 seed first; `member_create` answering `MemberFacts` and no link
                 (`command.rs:1058-1064`); `member_link_make`, `member_password_unset`,
                 `organization_delete` and `member_transfer_ownership` all registered
                 (`lib.rs:243-258`); the sync section's contents; *Never run* carrying the delete.
    observation  826's new requirement-17 correction says "the two forms are still mounted once in
                 the shell ... but the settings area is the only place that opens either". True:
                 `openOrganizationDialog` has exactly two non-test callers, `members.svelte:524`
                 and `workspaces.svelte:284`.
    **a stale sentence in source neither commit reached**  `store.rs:286` still opens the
                 `machine_link` docstring with "a link a member made for their own next machine",
                 which requirement 20 made false. `connect-screen.svelte:26-36` still cites "effort
                 828, requirement 3" for the machine link, and requirement 3 is superseded by
                 requirement 20. Neither is in an artifact this question covers; both are the same
                 falsehood the two commits corrected elsewhere.

## C. Round one's dead surface

    1. `useRevokeInvitation` (`query.ts`). **Gone.** Every remaining exported hook in `query.ts`
       has at least two readers outside the file (counted, minimum is 2).
    2. `invitation.revoke` router procedure. **Gone**, and `router.test.ts` pins the procedure list
       without it.
    3. `host.organization.invitation.revoke` and its testing stub. **Gone** from `host.ts`,
       `tauri.ts` and `platform/tests/testing.ts`.
    4. `invitation_revoke` command and its `lib.rs` line. **Gone.**
    5. `invite::invitation_link`. **Gone**, with `issuers_copy`, `split_issuer_copy` and the tests
       that were its only callers.
    6. `PendingInvitation` and `MemberFacts.pending`. **Gone** on both sides. `members()` dropped
       its `now` parameter with them (`invite.rs:709`), which is why `role.rs` and `removal.rs`
       appear in the diff; `standings()` still takes `now` and still reads the register
       (`invite.rs:774-798`), so no time-bounded fact was lost.
    7. `link-handover.svelte`. **Still present, with one reader**, `made-link.svelte:7`. Round one
       called it "not dead but has lost its reason", and neither ticket was asked to touch it. It
       is a one-consumer extraction, not dead surface.
    observation  I found no surface the two commits left dead. `organization.join.revoked` still
                 has a reader; `Refusal::Revoked` is still produced; `invitation.sealed_secret` is
                 a written column with no reader and a docstring saying so, which is a recorded
                 decision rather than an oversight.

## D. The changeset

`.changeset/a-link-needs-its-code.md` is now ten paragraphs. Round one's two false ones are gone:
the member's own second-machine paragraph was cut whole, and the you-section paragraph lost its
"connecting another machine of your own sits under its own heading" clause. The first paragraph no
longer names a reset link. Four further clauses were cut, as ticket 19's evidence records.

I read each of the ten against the tree. Nine are true of it. One overclaims:

    source       paragraph 7 (line 17), on deleting the organization: "every other machine finds
                 the organization gone the next time it opens and lands on the first screen."
    observation  `forget::forget_deleted_organization` reads a pull made through a replica a resume
                 has already opened. Its own docstring says so: "**A machine that stopped at the
                 wall pulls nothing and learns nothing**, because reaching the organization
                 database at all takes a credential a vault holds ... the launch after that one,
                 which resumes, is where it finds out" (`forget.rs:225-227`).
    interpretation for a machine that lands at the wall rather than resuming, the next time it
                 opens is not when it finds out; the launch after the sign-in is. This is round
                 one's ticket-13 limit, still unrecorded in the spec's *Risks*, and now stated as
                 fact in a changeset the customer reads.
    conclusion   nine paragraphs true, one true only of a machine that resumes.

## E. The 22 criteria at this tip

Round one's reading was re-confirmed rather than re-derived. Every Rust test it cited was found in
this run's output with `... ok`; every component and node test name it cited still exists in a file
that passed. **Where the tip differs from `ce612e50`**: the Rust count is 391 rather than 393 (four
tests removed with the revoke, two added in their place); the node count is 93 over seven files
rather than 90 over six (`script.test.ts` adds three); the component count is unchanged at 170 over
eleven; `validate.mjs` reports 269 artifacts rather than 266. Criterion 12's gap is closed and
criterion 19's is resolved in the criterion's own text.

| # | Verdict | Cited by |
| --- | --- | --- |
| 1 | **Met** | `link::tests::every_link_names_a_sealed_credential_and_the_half_that_opens_it ... ok`, `link::tests::the_payload_opens_on_the_code_and_the_secret_together_and_on_nothing_else ... ok`, `join::tests::the_link_secret_alone_opens_neither_the_payload_nor_the_vault ... ok`, `machine::tests::one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing ... ok`; `connect-screen.svelte.test.ts > the code field is on the form every link is read from, and on no step after it` (11 files passed) |
| 2 | **Met** | `invite::tests::a_link_seals_the_issuers_own_grant_and_lapses_no_later_than_it_does ... ok`, `machine::tests::a_machine_link_seals_the_makers_own_grant_and_lapses_no_later_than_it_does ... ok` |
| 3 | **Superseded** by criterion 20, dated in the spec | `area.svelte.test.ts > the you section offers no link act, and nothing on it hands a link over` passes; `another-machine.svelte`, `useMakeMachineLink` and `machine.link` are absent from `apps/desktop/src` |
| 4 | **Superseded** by criterion 16, dated in the spec | `area.svelte.test.ts > the sync section gives the owner the turso account and the disconnect, and no link` passes |
| 5 | **Met** | read: `credentials.md:82-123`, `organization.md:136-161` plus the new `:27-34` and `:208-213`, and 826's requirement 10, requirement 23, criterion 10 and the fifteen of B4 |
| 6 | **Superseded** by criterion 19, dated in the spec | ticket 07 is `status: obsolete`; judged under 19 |
| 7 | **Superseded** by criterion 21, dated in the spec | ticket 08 is `status: obsolete`; judged under 21 |
| 8 | **Met**, its second clause superseded and now struck in place | `area.svelte.test.ts > the you section states the password and draws no field until the change control is pressed` and the three `change-password.svelte.test.ts` tests pass; `> the you section offers signing out of other machines, behind one confirm` passes |
| 9 | **Met** | `workspace-menu.svelte.test.ts > one row leads to the settings area at the workspaces section` and `> nothing in the menu invites anybody or makes a workspace` pass |
| 10 | **Met** | `account-menu.svelte.test.ts > the way out is cased like the settings row beside it` and `> signed out, the way in is cased like the settings row beside it` pass; `i18n/tests/organization.test.ts > each term of requirement 18 is one english key, and its arabic is written` passes (`pass 93`) |
| 11 | **Met** | `link::tests::a_link_in_the_previous_shape_is_refused_as_a_link_that_is_not_one ... ok` |
| 12 | **Met**, round one's gap closed | `i18n/tests/script.test.ts`'s three tests pass; no `.skip(`, `.todo(`, `it.skip` or `test.skip` anywhere under `apps/desktop/src/**/*.test.ts`; two changesets on the branch |
| 13 | **Met** | `startup-sign-in.svelte.test.ts > a machine that has joined nothing asks for nothing and offers two ways in, each saying what it needs` passes |
| 14 | **Met** | `setup::tests::the_owners_password_connects_this_machine_to_the_organization_the_group_holds ... ok`, `an_administrators_password_is_refused_and_the_machine_holds_nothing ... ok`, `a_machine_seen_six_days_ago_shuts_the_way_in_and_the_consent_is_let_go_of ... ok`, `the_inspect_says_whether_the_group_already_holds_an_organization ... ok`, `a_group_already_holding_an_organization_refuses_the_run_and_gives_the_consent_back ... ok`, `a_first_run_creates_the_database_the_keys_the_rows_and_the_link_from_a_name_a_username_and_a_password ... ok`; `setup.test.ts` and `setup-walk.svelte.test.ts` pass |
| 15 | **Met** | `connect::tests::the_registry_follows_the_machine_through_the_connect_the_two_sessions_and_the_leave ... ok`, `store::tests::a_machine_counts_as_connected_for_seven_days_and_carries_the_member_signed_in_on_it ... ok`, `connect::tests::a_record_written_before_the_machine_id_opens_and_carries_an_empty_one ... ok`, `store::tests::the_nine_tables_exist_and_an_organization_holds_two_workspaces_at_once ... ok` |
| 16 | **Met** | `grep` over `apps/desktop/tauri/src` for `LINK_CREDENTIAL_LIFETIME`, `Credential::Clear` and `"never"` prints nothing; `link_credential_sealed` survives in a docstring at `invite.rs:1269` and in the docstring and fixture of `store::tests::a_replica_still_carrying_the_link_credential_column_opens_and_reads ... ok`; `link::tests::a_text_with_no_half_and_a_blank_half_are_not_links ... ok`; `connect::tests::a_connect_with_no_credential_in_hand_records_nothing ... ok`; `area.svelte.test.ts > the sync section ... and no link` passes |
| 17 | **Met** | `connect-screen.svelte.test.ts > before any link is read the form takes the link and the code, both typed left to right`, `> an invitation link pasted into the field lands on the password step, naming the organization`, `> a machine link connects with no further field, and lands on the wall`, `> text that was not a link keeps the form, says so, and marks the link field`, `> a wrong code and a missing one are each refused by name, and mark the code field` all pass; `connect.test.ts` passes (`pass 93`) |
| 18 | **Met**; its one limit is still recorded only in ticket 13 and now also overstated in the changeset (section D) | `removal::tests::the_owner_deletes_every_workspace_then_the_organization_and_keeps_nothing ... ok`, `an_administrator_and_a_wrong_password_are_each_refused_before_anything_is_deleted ... ok`, `the_refusals_come_before_any_write ... ok`, `forget::tests::a_launch_whose_pull_says_the_database_is_gone_forgets_the_organization ... ok`, `sync::turso::platform::tests::a_database_that_is_not_there_is_told_from_a_credential_and_from_a_remote_that_answered_nothing ... ok`; `area.svelte.test.ts > the owner is offered the delete, on a surface that says what goes and takes the password` and `> an administrator is offered no delete, because the block it sits in is the owners` pass |
| 19 | **Met**, and the criterion's own text now matches | `members.svelte.test.ts` passes 22 tests including `one card is drawn per account, in the order the list answers them`, `the owner card offers the owner the transfer alone`, `a reader meets no edit on their own card`, `each act is drawn by its own act and by no other`; the menu carries exactly `transfer, rename, role, access, link, unset-password, end-sessions, remove, lock-out` (`members.svelte:402-499`), with no revoke and no copy-link, which is what the corrected criterion asks for; `invite::tests::an_account_is_made_with_no_link_and_its_first_link_sets_its_password ... ok`, `a_standing_is_the_password_and_the_register_read_together ... ok` |
| 20 | **Met** | `invite::tests::an_account_is_made_with_no_link_and_its_first_link_sets_its_password ... ok`, `invite::tests::a_machine_signed_in_is_refused_a_link_and_a_reset_makes_the_next_one_ask_a_password ... ok`, `machine::tests::a_link_for_an_account_with_a_password_lands_at_the_wall_where_that_password_admits ... ok`, `machine::tests::one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing ... ok`; the gate at `invite.rs:451-463` bars a link only where the password is set and a machine is signed in; `area.svelte.test.ts > the you section offers no link act` passes |
| 21 | **Met** | `workspaces.svelte.test.ts` passes 18 tests including `one card is drawn per workspace, carrying its name and how many hold it`, `the open one is marked by a disc carrying its word, and no card says an access`, `each act is drawn by its own gate and by no other`, `export and import sit beneath the cards, under a legend naming the open workspace` |
| 22 | **Met** | `role::tests::a_transfer_swaps_the_roles_and_every_row_still_verifies_against_the_unchanged_key ... ok`, `the_old_owner_cannot_transfer_again_and_an_administrator_never_could ... ok`, `a_member_given_the_organization_is_certified_by_the_transfer ... ok`, `the_refusals_come_before_any_write ... ok`, `setup::tests::the_new_owner_connects_a_fresh_machine_by_the_seed_the_transfer_sealed ... ok`, `authority::tests::a_member_row_without_the_owner_seed_signs_the_bytes_it_signed_before_the_column ... ok`, `authority::tests::a_member_row_carrying_the_owner_seed_folds_it_into_what_it_signs ... ok`, `store::tests::a_member_row_with_the_owner_seed_and_one_without_both_read_back_verified ... ok`; `members.svelte.test.ts > the transfer opens a heavy form surface naming what changes and taking the password` and `area.svelte.test.ts > an owner holding no authority is told the authority follows the account that consented` pass |

**Tally: 18 met, 4 superseded (3, 4, 6, 7), 0 not met, 0 gaps open.**

## F. What the two commits changed that no ticket asked for

    observation  `c36b8dae` touched only what ticket 19 named, plus `.aep/index.md` (regenerated)
                 and the ticket file itself.
    observation  `6d152316` touched six files outside ticket 18's *Relevant areas*:
                 `removal.rs`, `role.rs` and `store.rs` (all three follow mechanically from
                 `members()` losing its `now` parameter when `MemberFacts.pending` went, and from
                 the docstrings that named the revoke); `members.svelte.test.ts` and
                 `workspaces.svelte.test.ts` (each drops `pending: null` from a fixture); and
                 `i18n-types.ts` (generated).
    observation  three source sentences were corrected, each recorded in ticket 18's Notes and in
                 the commit message: `connect-screen.svelte`'s docstring on the kinds of link,
                 `members.svelte`'s docstring on where the account form is mounted, and
                 `layout.signIn.disconnectDescription` in both locales.
    **the one to raise**  `layout.signIn.disconnectDescription` is a string a person reads in the
                 disconnect dialog, and it changed in both locales, from "the organization's link
                 connects this machine again" to "the owner connects this machine again with their
                 turso account; anybody else is given a link by whoever keeps the accounts." Ticket
                 18's third acceptance criterion reads "no changeset line, since nothing a person
                 sees changes", and its Notes argues the change is a correction rather than a new
                 capability. Both cannot be literally true: something a person sees did change.
                 Whether a corrected sentence earns a changeset line is the orchestrator's.
    observation  two locale keys also moved at integration and are recorded in the same Note: the
                 unread `organization.dashboard.revoked` was removed, and `organization.join.replaced`
                 was rewritten in both locales because it sent the person to a you-section act
                 ticket 14 retired. The second is also a person-visible string.

## G. A replica whose `member` table predates `owner_seed_sealed`

Stated as a finding. What to do about it is not mine.

    source       `store.rs:75-99`, the schema: the `member` table gained
                 `\"owner_seed_sealed\" BLOB` as its seventeenth column on this branch. At
                 `f56ac57a` the same table ends at `\"session_epoch\" INTEGER NOT NULL DEFAULT 0`,
                 sixteen columns.
    observation  nothing migrates it. Every statement in `SCHEMA` is `CREATE TABLE IF NOT EXISTS`,
                 so a table that exists is left exactly as it is, and `grep -rn "ALTER TABLE"` over
                 `apps/desktop/tauri/src` prints nothing. The replica and the remote `org-<id>` are
                 the same database, so neither side ever gains the column.
    observation  the read names its columns: `signed_members_where` issues
                 `SELECT "id", ..., "session_epoch", "owner_seed_sealed" FROM "member"...`
                 (`store.rs:845-857`) and then `let owner_seed_sealed = nullable_blob(&row, 16)?;`
                 (`store.rs:867`), which is the first thing read out of the row after the fixed
                 columns and before `verified(...)` is called.
    observation  `nullable_blob` accepts `Blob` and `Null` and fails on anything else with
                 `unexpected(index, "a blob or null", &other)` (`store.rs:1764-1770`), which builds
                 `Error::Integrity { message: "the organization database answered column 16 with
                 text where a blob or null was expected" }` (`store.rs:1800-1815`). That is the
                 human's sentence verbatim, index and all.
    source       `turso_core-0.8.0-pre.7`, `connection.rs:431-433`: "SQLite DQS misfeature: when ON
                 (default), unresolved double-quoted identifiers" fall back to string literals, and
                 `database.rs:2361` initialises `dqs_dml: AtomicBool::new(true)`.
                 `translate/emitter/mod.rs:111-115` says the same. Nothing in
                 `apps/desktop/tauri/src` calls `set_dqs_dml`.
    interpretation this is why the message says *text* rather than *no such column*. On a table
                 without the column, `"owner_seed_sealed"` in the select list does not fail to
                 resolve as an error; it resolves as the string literal `owner_seed_sealed`, so
                 every row answers column 16 with that text, and `nullable_blob` refuses it. The
                 shape change is therefore invisible to the parser and shows up as a corrupted row.
    conclusion (what such a machine meets)  **a refusal, on every member read, not a crash and not a
                 500.** `Error::Integrity` serialises with the code `integrity`
                 (`error.rs:192`) and the message above, and it is raised by
                 `signed_members_where`, which is behind `members`, `member` and
                 `members_unverified`. That reaches further than the settings page:
                 `session::sign_in` calls `store.members(&verifying_key)` before it opens any vault
                 (`session.rs:289`) and `session::acting_row` calls `store.member(...)`
                 (`session.rs:201`), so such a machine cannot sign in and cannot run any gated act,
                 and the members section is simply where the human happened to meet it. Nothing
                 panics; every path returns the same refusal.
    conclusion (the spec's assumption)  **it does not cover this.** The spec's *Assumptions* says
                 "Nothing is published, so a link in the previous shape has no holder to migrate
                 (requirement 11)", and requirement 11 is "Links made before this effort are
                 refused as links, and nothing migrates". Both are about a link's text. The only
                 data-at-rest reasoning on the branch is
                 `store::tests::a_replica_still_carrying_the_link_credential_column_opens_and_reads`,
                 whose docstring says "This is the whole of what retiring the organization's own
                 link does to data at rest" and is about a column being **dropped**, which a named
                 select tolerates. An added column that a named select requires is the opposite
                 case, and no requirement, criterion, risk or test covers it.
    conclusion (the repository's own pattern)  **it exists and would have applied.**
                 `forget::old_shape` reads `store.columns_of("member")` and
                 `columns_of("invitation")`, which run `PRAGMA table_info` (`store.rs:1686-1698`),
                 and turns a missing or surviving column into an `OldShape` variant that
                 `forget_old_shape` logs and acts on. Five signs exist, and the fifth is the exact
                 precedent: `OldShape::MemberWithoutSessionEpoch`, whose comment reads "a replica
                 missing this one alone was written between the signing key and requirement 22
                 [of 826] ... without it no reader here can say whether a remembered key is still
                 this member's run of sessions, and **every read of the row would fail on the
                 column**" (`forget.rs:83-86`, `:336-341`). The same sentence is true word for word
                 of `owner_seed_sealed`, and no sixth sign was added. A replica of the human's shape
                 passes `old_shape` clean, because it has `username_sealed`, `signing_public_key`
                 and `session_epoch`, and is then refused by every read.
    open         whether a sixth `OldShape` sign is the right answer, or a migration, or a
                 tolerated read, is a decision. What is established here is that the branch has no
                 answer for such a replica, that the failure is a refusal rather than a crash, that
                 it blocks sign-in and not only the settings page, and that the repository's own
                 pattern for exactly this was not extended.

# Conclusion

At `6d152316` the branch meets 18 of the 22 criteria and supersedes 4 (3, 4, 6, 7), with none unmet
and neither of round one's gaps open. The Arabic sweep exists and passes; the revoke surface, the
pending shape and the issuer-copy reader are gone with their tests, and nothing they touched was
left dead. Fifteen sentences in 826's spec and the three uncarried ones in the context, the rule and
the reference now carry dated 2026-09-16 corrections; 828's own three contradictions are corrected
in its spec. Nothing the two commits wrote is false of the tree.

Three things are left standing rather than closed, none of them a criterion. The Turso-authority
list in the organization context is still short by one act, and `turso.md`'s *Purpose* heading
still says two things where there are three; round one classed both as incomplete rather than
false, and neither ticket was asked to reach them. The changeset's paragraph on deleting the
organization says every other machine finds out at its next launch, which is true of a machine that
resumes and not of one that stops at the wall. And `layout.signIn.disconnectDescription` changed in
both locales under a ticket whose own criterion says nothing a person sees changed.

Section G is the one finding that is not about prose. A replica whose `member` table was written
before this branch is refused on every member read, including sign-in, by a named integrity error
that the SQLite double-quoted-string fallback disguises as a corrupted column rather than a missing
one. The spec's assumption that nothing migrates is about links, not schemas, and the repository's
own forget-sign pattern, which already carries a variant for exactly this shape of change, was not
extended to the new column.

These are findings. What to correct, what to build and what to accept as recorded is the
orchestrator's.

# Not checked

- The root `pnpm test`, `pnpm check` and `pnpm lint` gates were not run; the brief ruled out the
  root scripts. Tickets 18 and 19 record each passing at their own commits.
- `cargo fmt --check` was not run, as in round one.
- The ten ignored Rust tests reach a live Turso account and were not run.
- No screen was driven. Every claim about what a surface renders is read off a passing component
  test or the component source. The human's looks are cited from ticket Notes, and round one's E6
  still holds: no ticket records a look at the you section in the shape it ships in.
- Section G was established by reading the source, the schema and `turso_core`'s own comments. **No
  replica of the old shape was opened**, because building one would write, and no test on this
  branch exercises the case. The identification of the double-quoted-string fallback as the reason
  the message says *text* is an interpretation from `turso_core`'s source and the human's own error
  string, not something I ran.
- `.aep/index.md`'s currency was not re-derived, because regenerating it writes; `validate.mjs`
  printed `269 artifacts checked, no failures`.
- Test files outside the organization, layout, settings, i18n and error areas were not run.
- I did not read `.aep/rules/{interface,frontend,module-layout,testing,version-control}.md`; that is
  the standards reviewer's ground.
