---
status: open
---

# fix(organization): a role and an override set together are one act

## Outcome

Converge, round 1. Ticket 11's member card saves a changed role and a changed override as two
commands, `member_assign_role` and then `member_set_override`, so requirement 7's "flags held" is
checked on the state between them: a combination that changes only flags the actor holds can be
refused at the first step, and a refusal at the second leaves the first applied. After this,
assigning a role takes the override with it, the check compares the member's effective permissions
before and after the whole change, and the card saves both in one call.

## Acceptance Criteria

Traces requirements 5, 6 and 7 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 5 and 7.

- [ ] `member_assign_role` takes an optional override, and with one given, "flags held" compares the
      member's effective permissions before and after the role and the override together; the
      command stays gated on `assignRole`, and on `overrideMember` too where the override changes.
- [ ] A Rust test gives a member a role whose mask carries a flag the actor lacks together with an
      override switching that flag back, so their effective permissions move only in flags the actor
      holds: one act succeeds where the two steps were refused; and a combination moving a flag the
      actor lacks is refused whole, the row and the certificate unchanged.
- [ ] The member card saves a changed role and a changed override in one call, with a component test
      showing one command asked with both.

## Relevant areas

- `tauri/src/organization/role.rs` (`assign_role`, `set_override`, the shared `apply`), `command.rs`
- `src/lib/platform/tauri.ts`, `platform/host.ts`, `organization/query.ts`, `organization/router.ts`,
  `organization/component/host.svelte`, `member-sheet.svelte`

## Constraints

- The check stays at the command, per [[efforts/838-permissions-are-a-role-and-an-override/plan]],
  *Interfaces*; nothing moves into the reader.
