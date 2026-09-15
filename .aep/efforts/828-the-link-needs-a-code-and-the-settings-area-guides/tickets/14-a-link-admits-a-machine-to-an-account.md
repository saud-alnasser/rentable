---
status: open
blocked-by: ['13']
---

# feat(organization): a link admits a machine to an account

## Outcome

An account is made without a link and holds no password until its first link is opened; one
act makes a link for an account, choosing its kind by the account's standing and refused while
a machine is signed in on it; resetting a password unsets it; the member's own second-machine
act is gone from the you section. The onboarding is unchanged: the first kind asks a password,
the second lands at the wall.

## Acceptance Criteria

Traces requirements 19 and 20 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 19
(its Rust half), 20 and 12.

- [ ] Rust: `invite::create_account(session, username, role, permissions, workspaces)` writes
      the row as `issue` does up to the link (generated vault password, `must_change_password`,
      the certificate where the role needs one) and no invitation row; `link::make_for(session,
      store, member_id, kdf, now) -> MadeLink { link, code, expires_at }` refuses with
      `PreconditionFailed` where `store::connected_machines` shows a machine signed in on the
      account, and otherwise builds an invitation-kind link with an `invitation` row for an
      account whose `must_change_password` is set and a machine-kind link with a `machine_link`
      row for one whose it is not; `invite::unset_password(session, member_id)` seals a fresh
      generated vault password and sets `must_change_password`; `machine::make` and the
      self-service act go, `machine::connect` and the table stay. Tests: an account made with no
      link is refused at the wall until its link is opened; a link for an unset account opens
      with a chosen password on a second store and lands signed in; one for a set account lands
      at the wall where the password admits; an account with a machine signed in is refused a
      link; a reset unsets and the next link asks a password; a second opening and an opening
      after seven days are refused.
- [ ] `command.rs` and `lib.rs`: `member_create`, `member_link_make` (both `inviteMember`),
      `member_password_unset` (`resetPassword`); `member_invite`, `member_reset` and
      `machine_link_make` go; `host.ts`, `tauri.ts`, `router.ts`, `query.ts` follow
      (`useMakeMachineLink` goes); `router.test.ts` pins them. `another-machine.svelte` and its
      legend leave the you section; `area.svelte.test.ts` finds no link act there. The invite
      form becomes the account form (username, role, permissions, workspaces, no link result),
      and the handover block is what the link act's result shows, from wherever the members
      section calls it (ticket 15 draws the card; this ticket keeps `members.svelte` compiling
      against the new commands with its present rows).
- [ ] `connect-screen.svelte.test.ts` still shows the choose-password fields for an
      invitation-kind link and the wall for a machine-kind one; every string in both locales;
      `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket 03
      is extended with one paragraph on the account and the one link.

## Relevant areas

`apps/desktop/tauri/src/organization/{invite,link,machine,join,session,store,command}.rs`,
`apps/desktop/tauri/src/lib.rs`, `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/organization/{router,query,dialogs.svelte}.ts`,
`apps/desktop/src/lib/organization/component/{invite-form,another-machine,link-handover,members}.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/routes/settings/+page.svelte`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`, and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *A link
  admits a machine to an account*.**
- **Nothing under a signature changes.** The row an account is made with is the row `issue`
  wrote; only the link moves.
- **The two link kinds are ticket 03's and 04's**; this ticket chooses between them and adds
  none.

## Notes
