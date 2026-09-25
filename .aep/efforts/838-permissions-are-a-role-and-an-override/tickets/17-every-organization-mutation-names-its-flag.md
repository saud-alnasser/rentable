---
status: open
---

# fix(desktop): every organization mutation names its flag

## Outcome

Converge, round 2. Criterion 1 asks for a test that walks every mutation in every router and fails
on one that names no flag. Ticket 09's walk admits a `member` procedure as naming whose act it is,
and the organization router still marks as `member` mutations whose Rust command is gated on a
flag: deleting the organization, creating a workspace, removing a member, renewing credentials,
offering and withdrawing ownership, and setting and clearing the mark. After this, each names the
flag its Rust command checks, the walk fails on a mutation gated in Rust that names none, and the
router's stale sentence about the owner's acts is corrected.

## Acceptance Criteria

Traces requirements 1 and 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 1.

- [ ] Every organization-router mutation whose Rust command checks a flag names that flag in its
      meta (`deleteOrganization`, `createWorkspace`, `removeMember`, and `lockOut` where the removal
      locks out, `renewCredentials`, `transferOwnership`, `manageMark`), matching the Rust `GATES`
      table; a member's own acts (their password, their sessions elsewhere, accepting an offer made
      to them, opening a workspace they hold) stay `member` and say so.
- [ ] A test pairs each organization-router mutation with the Rust command it calls and fails where
      the router names a different flag from the command's gate, or none where the command has one.
- [ ] For each of those mutations, an identity lacking its flag is refused by the router, naming it,
      and the owner's own path is unchanged.
- [ ] The organization router's sentence that the permission package has no `createWorkspace` or
      `deleteWorkspace` act is corrected.

## Relevant areas

- `src/lib/organization/router.ts` and its tests, `src/lib/api/tests/flags.test.ts`
- `tauri/src/organization/command.rs` (the `GATES` table, read, not changed)

## Constraints

- The Rust command stays the gate that decides; the router's flag is the refusal in front of it, as
  for every other procedure.
