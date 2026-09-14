---
status: open
blocked-by: ['12', '14']
---

# fix(organization): the session epoch survives a stale write and a narrowed session is refused

## Outcome

A whole-row write of a member never moves their session epoch backwards, so a rename, a role
change, a removal or a reissue written from a replica that has not pulled cannot re-admit the
machines a sign-out-everywhere locked out; the epoch is bumped over a freshly pulled row and a
bump made offline is said to be pending and goes out at the next heartbeat; every act's gate
reads the member's permissions off the row rather than off the session opened at sign-in, so a
narrowing reaches an open session within one heartbeat; and the three announcements the settings
route raised itself are raised by declared mutations.

## Acceptance Criteria

Traces the correctness review of 2026-09-15 over the effort branch (findings 1, 2, 4, 5 and 6)
and its standards review (findings 1, 2 and 4), recorded in the pull request's run log, against
requirement 22 and requirement 6 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] and criteria 22 and 7.

- [ ] `store::write_member` never lowers `session_epoch`: the row keeps the greater of what it
      holds and what the record carries, and `store::set_session_epoch` does the same. A
      `store.rs` test bumps a member to 1, writes the row back whole from a record carrying 0
      (the shape `rename_member`, `change_role` and `retire_member` write) and reads 1; and
      `invite::issue` on a reissue carries the row's epoch through instead of the literal `0`,
      its comment corrected, asserted in `invite.rs` over a reset of a member at epoch 3.
- [ ] Every `permission::require(session.permissions, ...)` gate in `invite.rs`, `removal.rs`,
      `role.rs`, `session.rs` and `workspace.rs` reads the acting member's permissions off
      their row on the replica through one helper in `session.rs`, and refuses a row that is
      gone or `removed`. A `role.rs` test narrows a member out of `inviteMember` while they
      keep `removeMember`, then has their still-open session issue an invitation and is
      refused with the act named; a `workspace.rs` test narrows a member out of
      `renameWorkspace` and has their open session's rename refused. The organization
      context's boundary on what a member may do gains a dated sentence saying the gate is the
      row and the window is one heartbeat.
- [ ] `organization_session_end_elsewhere` and `member_end_sessions` pull the organization
      replica before the bump, as `invitation_accept` does; `session::end_elsewhere` and
      `session::end_member_sessions` answer whether the push went through; the commands answer
      `{ sent: boolean }` and `host.ts`, `platform/tauri.ts`, `platform/tests/testing.ts` and
      `organization/router.ts` follow with `router.test.ts` pinning it; the frontend's two
      hooks choose their success sentence from the answer, a bump not yet sent being said as
      pending in both locales ("this machine is offline; the sign-out reaches the others once
      it is back online", written not copied), asserted in the you section's test.
- [ ] The heartbeat's `command::ended_elsewhere` pushes the organization replica after its
      pull, so a bump written offline goes out at the next heartbeat with a connection; a
      `command.rs` test asserts a push is attempted on the heartbeat.
- [ ] The three `toast.success` calls in `routes/settings/+page.svelte` are gone: the removal
      announcement is chosen from the result inside `useRemoveMember`, and the two access loops
      become one declared mutation `useChangeAccess` in `organization/query.ts` whose
      `mutationFn` performs the grants and withdrawals and whose one success is
      `accessSaved`; `isChangingAccess` reads off it; `grep -n "toast\." routes/settings/+page.svelte`
      finds the pre-existing opener error alone.
- [ ] The doc comment on `invite::Invited` cites `[[rules/credentials]]` and amends nothing
      in prose; the doc comment on `command::member_invite` says the generated password leaves
      `issue` in two sealed columns and the link carries the invitation id and the link
      secret, which is what the code does.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test -- --test-threads=1` and
      `cargo fmt --check` pass; a changeset (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/tauri/src/organization/{store,session,invite,role,removal,workspace,command}.rs`;
`apps/desktop/src/lib/organization/{query,router}.ts`, `organization/component/end-other-sessions.svelte`,
`routes/settings/+page.svelte`, `platform/{host,tauri}.ts`, `platform/tests/testing.ts`,
`i18n/{en,ar}/index.ts`, `.aep/contexts/desktop/organization.md`, and the tests beside them.

## Constraints

- **Read the two review reports first**, at
  `C:/Users/SAUD-A~1/AppData/Local/Temp/claude/C--Users-saud-alnasser-Documents-workspace-rentable/84b600ea-9b7c-44f9-9ce4-e531f185360c/scratchpad/returns/review-correctness.md`
  and `review-standards.md`; each finding names its lines and its failure scenario.
- **The epoch stays outside the signature.** Signing it is the review's finding 3 and is the
  human's decision, not this ticket's; what this ticket makes true is that no write of this
  application's own lowers it.
- **[[rules/credentials]]**: nothing new crosses; `{ sent }` is a fact about a push.
- **[[rules/frontend]]**, *Data access*: the shared success and error handlers, never a
  `toast` call in a component.
- **No new act, no new column, no schema change.**

## Notes

Nothing yet.
