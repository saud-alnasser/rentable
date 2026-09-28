---
status: resolved
blocked-by: [59]
---

# fix(organization): a hunt for faults in the workspace layer closes what it found

## Outcome

Before the merge, the human asked for faults to be looked for and fixed again. Three readers went
over tickets 53 to 59, covering the Rust layer, the frontend logic and the switch surfaces. What
the orchestrator confirmed is closed here:

- **A handover was refused.** Handing the organization to a member with something pinned in a
  workspace was refused, and the root it had written was left behind.
- **A switch turned back was refused.** Turning an organization-wide switch back was refused as a
  reset where the member had nothing changed across the organization, so it cleared nothing.
- **A sheet redrawn over a refusal.** A sheet left open over a refusal drew the workspaces as they
  were before the save, so a grant change that went through was undone on screen and not sent
  again.
- **The dialog marked the wrong people as custom.** The workspace dialog marked someone custom
  there when the card did not, for a mask stored before a write needed its view.

## Acceptance Criteria

Traces requirement 12, and requirement 7, of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] Accepting the organization clears what is pinned for the new owner before anything is
      written; the acceptance test pins something for the manager first, and fails without it.
- [x] A switch brought back to the role is refused only where the saved override is not empty; a
      test.
- [x] Each grant change that went through is what a sheet left open is measured from; a test.
- [x] `isTailored` measures against what the member holds at full access with nothing pinned.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.
