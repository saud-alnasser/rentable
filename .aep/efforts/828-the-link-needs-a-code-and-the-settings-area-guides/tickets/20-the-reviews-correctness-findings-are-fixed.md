---
status: resolved
---

# fix(organization): the review's correctness findings are fixed

## Outcome

Nine defects the correctness review found in the whole branch are closed where they live: the
seal binds the link's address; removal and reset withdraw a member's open links and a machine
link refuses a removed member; the register's window is bounded above; the connect screen
requires the code and says the right thing on each machine-link refusal; the link act is absent
until an account's standing is known and sign-out-everywhere frees the gate; a refused way back
leaves nothing on disk and the walk tells a refusal from a lost consent; the link act also
follows `resetPassword`; a member table written before the owner-seed column is forgotten at
launch by the repository's own sign; two tests assert behaviour rather than implementation.

## Acceptance Criteria

Traces requirements 1, 14, 15, 17, 19 and 20 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 1,
14, 15, 17, 19, 20 and 12. Cut by review round one (its correctness findings 4 to 12), and by
the human's word on two things converge recorded.

- [x] `link.rs`: the payload's associated data binds the locator (organization id, verifying
      key, remote URL) beside the half's kind, id and expiry, so a seal lifted onto a link with
      another address opens nothing; a test rewrites `remoteUrl` on a sealed link and finds the
      code refused before any replica is opened; the module docstring's claim is then true.
      *Verified 2026-09-16 on the effort branch: `payload_context(locator, half)` binds six
      length-prefixed fields;
      `a_link_whose_address_was_rewritten_opens_nothing_with_the_right_code` ok in `cargo test
      -- --test-threads=1` (`396 passed; 0 failed; 10 ignored`); the link module's docstring
      corrected.*
- [x] `removal.rs` and `invite.rs`: retiring a member deletes their open `invitation` and
      `machine_link` rows, and a reset deletes their open machine links; `machine::connect`
      reads the member row and refuses a removed member by name before `connect::connect`;
      tests: a removed member's earlier machine link is refused and pulls nothing, a reset
      member's is refused.
      *Verified: `retire_member` deletes open invitation and machine-link rows,
      `reseal_account` the machine links; `machine::connect` refuses a removed member before
      `connect::connect` with `RefusalReason::Revoked`;
      `a_link_made_before_a_removal_admits_nobody_and_records_nothing` and
      `a_link_made_before_a_reset_admits_nobody_afterwards` ok. The credential is inside the
      link, so the replica is opened before any row can be judged; the refusal records
      nothing.*
- [x] `store::connected_machines` counts a row only where `seen_at` lies within the window on
      both sides; a row dated in the future does not count; a test pins it.
      *Verified: `"seen_at" > ? AND "seen_at" <= ?`;
      `a_machine_seen_in_the_future_does_not_count_as_connected` ok.*
- [x] `connect-screen.svelte` requires six characters on every link (no zero-length path) and
      its test finds no code-free path; `machine.rs`'s three refusal sentences say what is true
      (a new link comes from whoever keeps the accounts; a consumed machine link does not say
      this machine is connected; re-opening a link on the machine that used it is refused as
      already opened, not as held); `connect.ts` and the screen's test follow.
      *Verified: `hasCode` is `code.length === CODE_LENGTH`; `machine_link_refused` sends the
      person to whoever keeps the accounts; re-opening on the machine that spent the link is
      refused as consumed with no mention of disconnecting; the screen's refused step carries
      `wasConnecting` and offers no wall on the machine path; `connect-screen` 28 passed,
      `connect.test.ts` 15 passed.*
- [x] `members.svelte`: the link act is absent while the standings are loading or failed, and
      present only where the standing allows; `session::end_sessions_elsewhere` (or its command)
      clears the member's rows in the register so the gate follows the sign-out; tests pin both.
      *Verified: `linkable` is false for a null standing and the members test asserts the act
      absent with no standings; `store::clear_member_from_machines` is called by
      `session::end_member_sessions`, the card's sign-out-everywhere, which is the act that
      reaches the gate; the you section's `end_elsewhere` was left, since its machine is
      legitimately still signed in.*
- [x] `setup::connect_existing`: every refusal after the pull removes the replica it pulled
      (the `leave_nothing` shape), and the walk tells a refusal that kept the consent from one
      that let it go by the error's code rather than by whether the authority is held; tests
      pin a wrong-password refusal leaving no replica and a network failure keeping the consent.
      *Verified: every refusal past the replica open in `connect_existing` drops the replica
      and `leave_no_replica` removes the files, every arm returning the error it returned
      before; `refusalAfterFailedConnect` keys on the error's code and the route no longer
      refetches state; the Rust test asserts no replica and the consent intact on a wrong
      password, `setup.test.ts` the network case.*
- [x] `invite::make_link` is offered to a holder of `inviteMember` or `resetPassword`, and the
      router follows; `router.test.ts` pins it. The spec's risk on `resetPassword` is struck
      with a dated note.
      *Verified: `permission::require_any`, `make_link` accepting either act,
      `procedure.permittedAny('inviteMember', 'resetPassword')` in the router with
      `router.test.ts` adding a `resetPassword`-only caller; the spec's risk struck with a
      dated note.*
- [x] `forget.rs` gains the sign for a `member` table without `owner_seed_sealed`, read from
      `PRAGMA table_info` like the two member signs it joins, forgetting the organization at
      launch and landing on the first screen; a test writes such a replica and finds it
      forgotten; the plan's Migration says so.
      *Verified: `OldShape::MemberWithoutOwnerSeed` read from `columns_of("member")`, the
      fixture gaining the column, a replica without it forgotten and its files swept; the
      plan's *Migration* says so.*
- [x] `members.svelte.test.ts` no longer reads a component's source for its weight and both
      directory tests prove "no hover" through rendered behaviour rather than a class name.
      *Verified: the transfer surface's weight is read off the rendered
      `[data-slot=form-surface]`; both directory tests prove no hover through the trigger
      being visible, unhidden, and answering a click with no pointer over the card; the two
      remaining `opacity-0` mentions are comments saying what the tests used to read.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket 03
      carries no new paragraph, since nothing here is a capability.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9308 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `207 passed`); `cargo test`:
      `396 passed`; no changeset paragraph.*

## Relevant areas

`apps/desktop/tauri/src/organization/{link,invite,machine,removal,store,session,setup,forget,command}.rs`,
`apps/desktop/src/lib/organization/{connect,setup,router}.ts`,
`apps/desktop/src/lib/organization/component/{connect-screen,members}.svelte`,
`apps/desktop/src/lib/organization/tests/`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`, the
spec's Risks, the plan's Migration.

## Constraints

- **Each fix is the smallest that closes its finding**; nothing here redesigns.
- **The transfer is not touched here** (ticket 22 reopens it): findings 1 to 3 of the
  correctness review are its.
- **Nothing under a signature changes** beyond the seal's associated data, which is not a row.

## Notes

- *2026-09-16, at integration.* The review named `end_sessions_elsewhere`; the repository has
  two acts, the you section's `end_elsewhere` (keeps this machine) and the card's
  `end_member_sessions`; the gate is reachable from the second alone, so that one clears the
  register. `delete_open_machine_links_of`'s docstring still speaks of one link at a time and
  now has three callers; left for ticket 21's pass over docstrings.
