---
status: resolved
blocked-by: [54]
---

# fix(organization): what is tailored in a workspace is pinned

## Outcome

Review round one of tickets 53 and 54 found three faults and some stale docs. The human decided
the first: what is tailored in a workspace is pinned.

- **A workspace override inverted when the layers beneath it moved.** It is now stored as the
  flags set for the workspace and their values.
- **The sheet kept showing cleared tailoring after a partly refused save.**
- **A role pick or a reset was not refused in advance** where clearing the tailoring moves a flag
  the reader does not hold.
- **A grant already minted read-only was still the owner's alone to change.** That rule belonged
  to the lock the human has dropped.

## Acceptance Criteria

Traces requirement 12, and requirement 7, of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `workspace_override` holds `pinned` and `granted`; the workspace's permissions are
      `(effective & !pinned) | granted` with a write dropped where its kind's view is not held,
      in Rust and the package; the shared table's workspace cases cover a layer beneath moving
      (read only staying read only when a write is taken away across the organization, and when
      the role gains one).
- [x] The act, the authority and the store take the two masks; a flag pinned is one the signer
      holds; refusals as before; tests updated.
- [x] The card pins a switch turned, pins every write off for *read only*, unpins all for *reset*,
      and marks what is pinned; saving sends the two masks.
- [x] After a partly refused save, a role or reset that went through shows every workspace's
      tailoring cleared; a test.
- [x] A role pick or a reset whose clearing would move a pinned flag the reader does not hold is
      refused at the control, saying why; a test.
- [x] `grant_workspace` and `withdraw_grant` no longer ask the owner for a grant minted read-only,
      and the interface drops `ownerMadeReadOnly`; tests.
- [x] Docs name the workspace layer where record permissions are folded (`rules/interface`,
      `rules/api-layer`, `contexts/desktop/organization`), the garbled sentence in
      `rules/interface` is rewritten, and the long comment in `workspace/component/permissions.svelte`
      is wrapped; the plan's lock section notes it is superseded.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.
