---
status: open
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

- [ ] `link.rs`: the payload's associated data binds the locator (organization id, verifying
      key, remote URL) beside the half's kind, id and expiry, so a seal lifted onto a link with
      another address opens nothing; a test rewrites `remoteUrl` on a sealed link and finds the
      code refused before any replica is opened; the module docstring's claim is then true.
- [ ] `removal.rs` and `invite.rs`: retiring a member deletes their open `invitation` and
      `machine_link` rows, and a reset deletes their open machine links; `machine::connect`
      reads the member row and refuses a removed member by name before `connect::connect`;
      tests: a removed member's earlier machine link is refused and pulls nothing, a reset
      member's is refused.
- [ ] `store::connected_machines` counts a row only where `seen_at` lies within the window on
      both sides; a row dated in the future does not count; a test pins it.
- [ ] `connect-screen.svelte` requires six characters on every link (no zero-length path) and
      its test finds no code-free path; `machine.rs`'s three refusal sentences say what is true
      (a new link comes from whoever keeps the accounts; a consumed machine link does not say
      this machine is connected; re-opening a link on the machine that used it is refused as
      already opened, not as held); `connect.ts` and the screen's test follow.
- [ ] `members.svelte`: the link act is absent while the standings are loading or failed, and
      present only where the standing allows; `session::end_sessions_elsewhere` (or its command)
      clears the member's rows in the register so the gate follows the sign-out; tests pin both.
- [ ] `setup::connect_existing`: every refusal after the pull removes the replica it pulled
      (the `leave_nothing` shape), and the walk tells a refusal that kept the consent from one
      that let it go by the error's code rather than by whether the authority is held; tests
      pin a wrong-password refusal leaving no replica and a network failure keeping the consent.
- [ ] `invite::make_link` is offered to a holder of `inviteMember` or `resetPassword`, and the
      router follows; `router.test.ts` pins it. The spec's risk on `resetPassword` is struck
      with a dated note.
- [ ] `forget.rs` gains the sign for a `member` table without `owner_seed_sealed`, read from
      `PRAGMA table_info` like the two member signs it joins, forgetting the organization at
      launch and landing on the first screen; a test writes such a replica and finds it
      forgotten; the plan's Migration says so.
- [ ] `members.svelte.test.ts` no longer reads a component's source for its weight and both
      directory tests prove "no hover" through rendered behaviour rather than a class name.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket 03
      carries no new paragraph, since nothing here is a capability.

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
