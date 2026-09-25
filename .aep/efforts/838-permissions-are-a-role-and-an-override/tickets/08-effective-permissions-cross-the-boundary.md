---
status: open
blocked-by: [07]
---

# feat(desktop): effective permissions and roles cross the boundary

## Outcome

`SessionFacts`, `OrganizationMember` and the roles list carry the role, its rank, the override and
the effective permissions; the tRPC identity holds the effective permissions for the current
workspace, with a read-only grant's writes cleared; and a change on another machine reaches the
router and the interface within one sync heartbeat.

## Acceptance Criteria

Traces requirements 8 and 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 8 and 10.

- [ ] `SessionFacts` and `OrganizationMember` gain `roleId`, `roleName`, `rank` and `override`;
      `permissions` is effective; `RoleFacts` crosses from `organization_roles`; the TS types in
      `platform/host.ts` match, and nothing about a certificate crosses.
- [ ] `actingIdentity` sets `permissions` to `effectiveIn(session.permissions, accessLevel)` for the
      current workspace; on a read-only grant every `WRITE_FLAGS` bit is clear (criterion 10).
- [ ] After a heartbeat pull the organization state and the context's identity are re-read; a test
      changes the host's state across a heartbeat and the next call's permissions follow it
      (criterion 8).
- [ ] `requirePermission`'s refusal names the flag and does not say "in this workspace" for an
      organization flag.

## Relevant areas

- `tauri/src/organization/session.rs` (`SessionFacts`, `facts_of`), `command.rs`
- `src/lib/platform/host.ts`, `src/lib/api/context.ts`, `src/lib/api/trpc.ts`, `src/lib/sync/autosync.ts`

## Constraints

- Rust's gates already re-read the row per act; this ticket brings the TS side level with them and
  changes no Rust gate.
