---
status: resolved
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

- [x] `store::write_member` never lowers `session_epoch`: the row keeps the greater of what it
      holds and what the record carries, and `store::set_session_epoch` does the same. A
      `store.rs` test bumps a member to 1, writes the row back whole from a record carrying 0
      (the shape `rename_member`, `change_role` and `retire_member` write) and reads 1; and
      `invite::issue` on a reissue carries the row's epoch through instead of the literal `0`,
      its comment corrected, asserted in `invite.rs` over a reset of a member at epoch 3.
- [x] Every `permission::require(session.permissions, ...)` gate in `invite.rs`, `removal.rs`,
      `role.rs`, `session.rs` and `workspace.rs` reads the acting member's permissions off
      their row on the replica through one helper in `session.rs`, and refuses a row that is
      gone or `removed`. A `role.rs` test narrows a member out of `inviteMember` while they
      keep `removeMember`, then has their still-open session issue an invitation and is
      refused with the act named; a `workspace.rs` test narrows a member out of
      `renameWorkspace` and has their open session's rename refused. The organization
      context's boundary on what a member may do gains a dated sentence saying the gate is the
      row and the window is one heartbeat.
- [x] `organization_session_end_elsewhere` and `member_end_sessions` pull the organization
      replica before the bump, as `invitation_accept` does; `session::end_elsewhere` and
      `session::end_member_sessions` answer whether the push went through; the commands answer
      `{ sent: boolean }` and `host.ts`, `platform/tauri.ts`, `platform/tests/testing.ts` and
      `organization/router.ts` follow with `router.test.ts` pinning it; the frontend's two
      hooks choose their success sentence from the answer, a bump not yet sent being said as
      pending in both locales ("this machine is offline; the sign-out reaches the others once
      it is back online", written not copied), asserted in the you section's test.
- [x] The heartbeat's `command::ended_elsewhere` pushes the organization replica after its
      pull, so a bump written offline goes out at the next heartbeat with a connection; a
      `command.rs` test asserts a push is attempted on the heartbeat.
- [x] The three `toast.success` calls in `routes/settings/+page.svelte` are gone: the removal
      announcement is chosen from the result inside `useRemoveMember`, and the two access loops
      become one declared mutation `useChangeAccess` in `organization/query.ts` whose
      `mutationFn` performs the grants and withdrawals and whose one success is
      `accessSaved`; `isChangingAccess` reads off it; `grep -n "toast\." routes/settings/+page.svelte`
      finds the pre-existing opener error alone.
- [x] The doc comment on `invite::Invited` cites `[[rules/credentials]]` and amends nothing
      in prose; the doc comment on `command::member_invite` says the generated password leaves
      `issue` in two sealed columns and the link carries the invitation id and the link
      secret, which is what the code does.
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test -- --test-threads=1` and
      `cargo fmt --check` pass; a changeset (`@rentable/desktop`, patch) rides with the change.

## Relevant areas

`apps/desktop/tauri/src/organization/{store,session,invite,role,removal,workspace,command}.rs`;
`apps/desktop/src/lib/organization/{query,router}.ts`, `organization/component/end-other-sessions.svelte`,
`routes/settings/+page.svelte`, `platform/{host,tauri}.ts`, `platform/tests/testing.ts`,
`i18n/{en,ar}/index.ts`, `.aep/contexts/desktop/organization.md`, and the tests beside them.

## Constraints

- **Read the two review reports first**, recorded finding by finding in the pull request's run
  log; each names its lines and its failure scenario.
- **The epoch stays outside the signature.** Signing it is the review's finding 3 and is the
  human's decision, not this ticket's; what this ticket makes true is that no write of this
  application's own lowers it.
- **[[rules/credentials]]**: nothing new crosses; `{ sent }` is a fact about a push.
- **[[rules/frontend]]**, *Data access*: the shared success and error handlers, never a
  `toast` call in a component.
- **No new act, no new column, no schema change.**

## Notes

Built by an implementer and landed on 2026-09-15. Departures: `useGrantWorkspace` and
`useWithdrawGrant` are deleted, `useChangeAccess` having replaced their only caller; the you
section's assertions live in a new `organization/tests/sessions.test.ts` over the hooks, since
the area test renders `onEndOtherSessions` as a prop and cannot see them;
`platform/tests/testing.ts` needed no edit because its organization entries all refuse;
`organization_session_end_elsewhere` answers `SessionsEnded { sent }` rather than
`OrganizationState`, which the router discarded and the hook refetches; the heartbeat test reads
the wire against a scripted server and pins that the first request is the pull and the second
is not, rather than the push's private path.

Review round two (2026-09-15) found four things in this ticket's own work and they were fixed
here, after the second and last review round and so without a pass of their own: a machine
whose sessions had been ended could bump past its own revocation from the you section and file
its key under the new number, so the acting row is now read through one `session::acting_row`
that refuses a session behind its row before any act and before the bump, asserted in
`session.rs`; the epoch floor read the same replica the stale record came from, so the five
commands that write a member row whole (`member_rename`, `member_change_role`,
`member_remove`, `member_reset`, `invitation_revoke`) pull first, as the two session-ending
ones do; the gate read every member row and one tampered row would have stopped every act, so
`OrganizationStore::member` reads the acting row alone, verified on its own, asserted beside
the tampered-row test in `store.rs`; and `useChangeAccess` refreshes the list on a refusal part
way as on success, asserted in `sessions.test.ts`. What remains of the first: a machine offline
when the sessions were ended can still write a stale epoch back and push it later, which the
pull cannot help; the robust shape is the epoch in a row of its own merged by maximum, a data
model change for the human to weigh with the unsigned epoch.

Raised, not taken: the epoch stays unsigned (the review's finding 3, the human's call);
`change_role`'s widening check and `require_owner` still read `session.role` rather than the
row; `procedure.permitted(...)` on the TypeScript side still gates on the session snapshot, so
the screen and Rust can disagree for up to one heartbeat about what a narrowed member may
reach.
