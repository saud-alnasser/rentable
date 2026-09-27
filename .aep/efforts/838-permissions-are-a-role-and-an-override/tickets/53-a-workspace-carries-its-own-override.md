---
status: resolved
blocked-by: [52]
---

# feat(organization): a workspace carries its own override

## Outcome

A member's permissions in a workspace are their organization-wide permissions switched by an
override for that workspace, over record flags only. The override is a signed row that arrives with
format 3, is set and cleared under the organization override's rules, and is read by the session
and by the frontend context for the workspace open.

## Acceptance Criteria

Traces requirements 6, 7, 8, 10 and 12 of
[[efforts/838-permissions-are-a-role-and-an-override/spec]], and requirement 14.

- [x] `transition/three.rs` adds `workspace_override`; `FORMAT_VERSION` is 3; the runner walks a
      format 2 organization to 3 with its copy, and the format 1 walk still passes.
- [x] `Authority::WorkspaceOverride` covers as the plan says; a row written around the command
      beyond its signer's ceiling or rank, naming an administration flag, or about the signer's
      own member, is left out on read.
- [x] `set_workspace_override` sets, replaces and clears (zero deletes) the row, and refuses an
      administration flag, a flag the actor does not hold, a member at or above the actor, oneself,
      a workspace the member holds no grant on, and a result with a write and not its view; each
      refusal is named and tested.
- [x] `assign_role`, a deleted role's holders, `set_override` to zero, `withdraw_grant`, removal
      and `delete_workspace` clear the member's workspace overrides; tested.
- [x] The session and the member facts carry each workspace's override and permissions; the shared
      effective table gains workspace cases, read by the Rust and the package tests
      (`effectiveInWorkspace`).
- [x] The frontend context answers record procedures by the open workspace's permissions folded by
      its level; a test.
- [x] A Tauri command and a `platform` binding for the act; the host types carry the new fields.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.
