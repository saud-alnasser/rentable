---
status: resolved
---

# feat(organization): an account is held on as many machines as it is signed in on

## Outcome

Nothing refuses a second machine. The owner's Turso account connects a machine whether or not
another owner's or administrator's machine was seen this week, and a link is made for an account
with a password whether or not a machine is signed in on it. The register still feeds the
standing line on every card and gates nothing. The plan, the context, the changeset and the
docstrings say the same.

## Acceptance Criteria

Traces requirements 14, 15 and 20 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] as corrected 2026-09-20,
and criteria 14 and 20. Cut on the human's look at the closed build: the owner met the register's
refusal on a second machine and was pointed at a link no owner is handed, and the human ruled out
one machine per account for everybody.

- [x] `setup::connect_existing` reads the register for nothing: `in_use_by_somebody_who_can_invite`
      and `A_CONNECTED_MACHINE_CAN_HAND_OUT_A_LINK` are gone with the refusal, and no Rust source
      formats a sentence pointing at a link another machine can make. The test that found a
      machine seen six days ago shutting the way in is turned round: an owner's machine seen six
      days ago, with the owner signed in on it, and the consent still connects this machine and
      signs the owner in; the first machine's session and its register row stand. The docstrings
      on `connect_existing` and on the register's readers say the register gates nothing.
      *Verified 2026-09-20 on the ticket branch: no Rust source names `in_use_by_somebody_who_can_invite`, `A_CONNECTED_MACHINE_CAN_HAND_OUT_A_LINK` or "make a link on that machine"; `connected_machines` is reached from `setup.rs` only inside its tests; `a_machine_seen_six_days_ago_leaves_the_way_in_open_and_keeps_its_own_session` registers the owner's machine six days back, connects, finds both register rows naming the owner, `session::ended_elsewhere` false for the first machine and the consent kept (`organization::setup::tests` 21 passed); the docstrings on `connect_existing`, `connected_machines`, `MachineRecord`, `clear_member_from_machines` and the command say the register gates nothing.*
- [x] `invite::make_link` makes a link for an account with a password while a machine is signed in
      on it, and that link lands its machine at the wall like any other; the register read and the
      sentence "a machine is signed in on that account ..." are gone; the criterion 20 test is
      turned round the same way (the account with a machine signed in is offered a link, and it
      opens at the wall), and the docstring's paragraph on the refusal says what is true now.
      *Verified: `make_link` reads no register and formats no refusal; `a_machine_signed_in_is_offered_a_link_and_a_reset_makes_the_next_one_ask_a_password` finds the register naming the machine and the link made, machine-kind, no vault password (18 passed); `machine.rs`'s `a_link_for_an_account_with_a_password_lands_at_the_wall_where_that_password_admits` now makes the link while a machine is signed in and opens it at the wall (6 passed); the docstring and the module doc say an account is held on as many machines as it is given links for.*
- [x] The connect walk keeps nothing only that refusal produced: `setup.test.ts` no longer asserts
      that sentence in Rust, and the `preconditionFailed` return to the consent stays exactly where
      a connect refusal of that code still exists (`NOTHING_TO_CONNECT_TO` is one) and its test
      uses that sentence instead.
      *Verified: `refusalAfterFailedConnect` keeps the `preconditionFailed` return to the consent, since `NOTHING_TO_CONNECT_TO` and `connect::refuse_while_held` still raise it; its test drives it with that sentence, and the Rust-sentence test asserts `NOTHING_TO_CONNECT_TO` and `ONLY_THE_OWNER_CONNECTS` present and "make a link on that machine" absent (`setup.test.ts` 27 pass, 0 fail).*
- [x] The members directory offers the link act on every card it is allowed on, whatever the
      standing line says; the standing line stays as a fact in its three forms; every comment and
      locale string in `members.svelte`, `en/index.ts` and `ar/index.ts` that says the standing is
      why a link is absent, or that somebody signs out of one machine to be given another, is
      corrected; `members.svelte.test.ts` pins a card standing *signed in on a machine* offering
      the link act.
      *Verified: `linkable()` is gone from `members.svelte` and the link entry is `canLink && writable(member)`; the standing line keeps its three forms; the card docstring, the link-entry comment, the `standing*` comment in `en/index.ts`, `host.ts`, `router.ts` and `invite.rs`'s `MemberStanding` docstrings are corrected; `ar/index.ts` carried nothing to correct and no key changed; `the link act is offered whatever the standing says, and the line stays a fact` pins a card standing signed in on a machine offering `link` (`members.svelte.test.ts` 35 passed).*
- [x] The plan's *Every connected machine is registered*, *The account connects to the
      organization the group holds* and *An account is made first* sections carry a dated
      correction (2026-09-20), the last one's *Rejected* line included; the context's **Only the
      owner can** passage on the way in and its `machine` table entry are corrected the same way;
      `.changeset/a-link-needs-its-code.md` says in its second, fourth and seventh paragraphs
      that an account is held on as many machines as it is given links for, that the owner's
      Turso account connects a machine whatever other machines are in use, and that the standing
      line is a fact and not the reason for a missing link.
      *Verified: dated corrections of 2026-09-20 appended to the plan's register, way-in and link sections (the last is titled *A link admits a machine to an account*, the section the ticket described by its Rejected line); the context's one-group bullet retires the seven-day sentence and the language entry says the `machine` table gates nothing and is read in one place; the changeset's second, fourth and seventh paragraphs are corrected in place, the fourth no longer framing the Turso way in as a last resort.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test -- --test-threads=1` pass;
      `cargo fmt --check` prints nothing; no new changeset, since the existing one is corrected.
      *Verified on the ticket branch: `pnpm check` (desktop 9313 FILES 0 ERRORS 0 WARNINGS), `pnpm lint`, `pnpm test` (desktop 991 node and 241 vitest) exit 0; `cargo test -- --test-threads=1` 409 passed 0 failed 10 ignored; `cargo fmt --check` prints nothing; `validate.mjs` 281 artifacts checked, no failures; no new changeset. Re-run at integration in the run's worktree: see the run log.*

## Relevant areas

`apps/desktop/tauri/src/organization/{setup,invite,store}.rs`,
`apps/desktop/src/lib/organization/component/members.svelte`,
`apps/desktop/src/lib/organization/tests/{members.svelte.test.ts,setup.test.ts}`,
`apps/desktop/src/lib/organization/setup*.ts` (the walk's `refusalAfterFailedConnect`),
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`, `.aep/contexts/desktop/organization.md`, the
effort's `plan.md`, `.changeset/a-link-needs-its-code.md`.

## Constraints

- **The register stays.** Machines still register, name their member, refresh and leave; the
  standing line still reads it. Only its two gates go.
- **One link admits one machine once**, and a link's kind still follows the account's password.
- **Sessions are untouched.** Signing in on a second machine ends nothing on the first; sign out
  everywhere is the only act that does.
- **Each edit is the smallest that makes the sentence true**; nothing under a signature changes.
- No em dashes in source comments, locale strings or the changeset.

## Notes

- *2026-09-20, at integration.* Raised by the builder and accepted: three test fixtures that existed only for the link gate went with it (the reset test's machine unregistering, `machine.rs`'s helper signing the member out, one `unregister_machine` call); two more false sentences found on a sweep were corrected (`host.ts`'s `connectExisting` docstring and the locale test's comment); `store::connected_machines` keeps its upper bound on a changed rationale, a rewritten row now buying a wrong line on a card rather than a shut way in, said in the docstring.
- *2026-09-20, at review.* One round over the ticket's diff, both axes. No functional defect. Standards found seven stale sentences the gates' removal left (a duplicated line in the context, `machine.rs`'s fixture docstring, the presence window's constant, `leave_registry`, a `session.rs` test comment, the plan naming `link::make_for`, `setup.ts`'s heading); correctness found four more (`member_link_make`'s comment, the new-organization page's docstring, `setup.ts` enumerating the refusals as if complete, the context's credential-renewal entry assuming one owner machine) and a fixture that pinned its precondition implicitly. All fixed at integration; the fixture now asserts the register names the machine. Raised, recorded in the changeset: one unopened machine link stands for an account at a time, since making the next replaces it, so a second machine is given its link after the first has used theirs.
