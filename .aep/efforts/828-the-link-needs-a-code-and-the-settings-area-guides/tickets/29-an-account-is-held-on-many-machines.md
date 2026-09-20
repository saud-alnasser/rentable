---
status: open
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

- [ ] `setup::connect_existing` reads the register for nothing: `in_use_by_somebody_who_can_invite`
      and `A_CONNECTED_MACHINE_CAN_HAND_OUT_A_LINK` are gone with the refusal, and no Rust source
      formats a sentence pointing at a link another machine can make. The test that found a
      machine seen six days ago shutting the way in is turned round: an owner's machine seen six
      days ago, with the owner signed in on it, and the consent still connects this machine and
      signs the owner in; the first machine's session and its register row stand. The docstrings
      on `connect_existing` and on the register's readers say the register gates nothing.
- [ ] `invite::make_link` makes a link for an account with a password while a machine is signed in
      on it, and that link lands its machine at the wall like any other; the register read and the
      sentence "a machine is signed in on that account ..." are gone; the criterion 20 test is
      turned round the same way (the account with a machine signed in is offered a link, and it
      opens at the wall), and the docstring's paragraph on the refusal says what is true now.
- [ ] The connect walk keeps nothing only that refusal produced: `setup.test.ts` no longer asserts
      that sentence in Rust, and the `preconditionFailed` return to the consent stays exactly where
      a connect refusal of that code still exists (`NOTHING_TO_CONNECT_TO` is one) and its test
      uses that sentence instead.
- [ ] The members directory offers the link act on every card it is allowed on, whatever the
      standing line says; the standing line stays as a fact in its three forms; every comment and
      locale string in `members.svelte`, `en/index.ts` and `ar/index.ts` that says the standing is
      why a link is absent, or that somebody signs out of one machine to be given another, is
      corrected; `members.svelte.test.ts` pins a card standing *signed in on a machine* offering
      the link act.
- [ ] The plan's *Every connected machine is registered*, *The account connects to the
      organization the group holds* and *An account is made first* sections carry a dated
      correction (2026-09-20), the last one's *Rejected* line included; the context's **Only the
      owner can** passage on the way in and its `machine` table entry are corrected the same way;
      `.changeset/a-link-needs-its-code.md` says in its second, fourth and seventh paragraphs
      that an account is held on as many machines as it is given links for, that the owner's
      Turso account connects a machine whatever other machines are in use, and that the standing
      line is a fact and not the reason for a missing link.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test -- --test-threads=1` pass;
      `cargo fmt --check` prints nothing; no new changeset, since the existing one is corrected.

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
