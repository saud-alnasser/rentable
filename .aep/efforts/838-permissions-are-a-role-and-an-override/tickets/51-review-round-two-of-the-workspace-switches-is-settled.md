---
status: resolved
blocked-by: [50]
---

# fix(desktop): review round two of the workspace switches is settled

## Outcome

Review round two of ticket 50 found no blocking fault, and no third round follows, so it is settled
here by the orchestrator. Refusing *who is in a workspace* rather than hiding it put a row in the
command menu that could never run, which `rules/interface` keeps out. The owner on a machine
without the Turso authority could not unlock, though unlocking re-seals their own full access and
needs no authority. And nothing tested that the host passes the authority at all.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The menu offers an act only where some record admits it; one refused on every record for
      anything but a write already running is left out; a test finds *who is in a workspace* left
      out for a reader without `grantWorkspace`, and the running-write test still lists its act.
- [x] The owner without the authority may unlock; a test saves the unlock.
- [x] A host-level test opens the dialog as the owner with and without the authority and finds the
      lock refused, then live.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.
