---
status: open
blocked-by: [23, 24, 25, 26]
---

# docs(aep): the rules, contexts and references say what was built

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap F: the statements the effort falsified are corrected in the effort. [[rules/interface]]'s *List presentation* describes the tenant (144) and contract (184) tiles beside the complex tile; *Search* no longer names a transfer beneath the workspace cards; *Loading* describes the settings skeleton as it is. [[contexts/desktop/organization]] says the transfer procedures answer for a named workspace through `permittedIn`, and with [[contexts/desktop/remote-sync]] describes one machine's sign-out (`machine_sign_out`, the acknowledged mark, the resume, heartbeat and act checks). [[references/shadcn-svelte]] records that CLI 1.7.0's `add <x> -y` prompts over an existing dependency and defaults to overwriting it, and the family count in it and [[rules/frontend]] is the folder count.

## Acceptance Criteria

Traces requirement 22 and criterion 22.

- [ ] Each statement above reads as built, with file and line quoted in the commit body.
- [ ] `node .aep/scripts/validate.mjs` passes and the index is regenerated.

## Relevant areas

- `.aep/rules/{interface,frontend}.md`, `.aep/contexts/desktop/{organization,remote-sync}.md`, `.aep/references/shadcn-svelte.md`

## Constraints

- Say what the code does now; no source change.
