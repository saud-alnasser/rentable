---
status: resolved
blocked-by: [10]
---

# docs(desktop): the contexts say a machine holds several organizations

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (*Constraints*, the contexts that state one organization per machine), and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*Technical Approach*, step 10).

## Outcome

[[contexts/desktop/remote-sync]] and [[contexts/desktop/organization]] describe what the effort built: several organizations held, one open, how each keeps its replicas, key and Turso consent, how a link is spent and how long it lasts, the signed name, and the rename. No context or code comment still says a machine holds one organization.

## Acceptance Criteria

Traces requirement 1 and criterion 1, through the spec's constraint that the contexts are corrected in the same change.

- [x] `remote-sync.md` and `organization.md` are corrected where they state or imply one organization per machine, the shared consent account, the prefix-wide forget, or the week-long link, each with a dated note saying what it read before.
- [x] A search for "one organization or none", "holds one organization" and `AnotherOrganizationHeld` across `apps/desktop/` and `.aep/contexts/` finds nothing current.
- [x] `node .aep/scripts/index.mjs` and `node .aep/scripts/validate.mjs` pass.

## Relevant areas

- `.aep/contexts/desktop/{remote-sync.md,organization.md}`, `.aep/rules/interface.md` (the leaving card's line)

## Constraints

- `.aep/` prose; the changesets rode with their tickets.
