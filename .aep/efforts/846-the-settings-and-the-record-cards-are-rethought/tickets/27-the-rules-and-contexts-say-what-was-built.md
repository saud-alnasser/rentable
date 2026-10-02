---
status: resolved
blocked-by: [23, 24, 25, 26]
---

# docs(aep): the rules, contexts and references say what was built

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap F: the statements the effort falsified are corrected in the effort. [[rules/interface]]'s *List presentation* describes the tenant (144) and contract (184) tiles beside the complex tile; *Search* no longer names a transfer beneath the workspace cards; *Loading* describes the settings skeleton as it is. [[contexts/desktop/organization]] says the transfer procedures answer for a named workspace through `permittedIn`, and with [[contexts/desktop/remote-sync]] describes one machine's sign-out (`machine_sign_out`, the acknowledged mark, the resume, heartbeat and act checks). [[references/shadcn-svelte]] records that CLI 1.7.0's `add <x> -y` prompts over an existing dependency and defaults to overwriting it, and the family count in it and [[rules/frontend]] is the folder count.

## Acceptance Criteria

Traces requirement 22 and criterion 22.

- [x] Each statement above reads as built, with file and line quoted in the commit body. *Verified: the commit body quotes each correction with file and line: interface List presentation (278-309, tenant 144, contract 184, complex 120, Cell.Fact, units as rows), Search (332-333), Loading (1074-1075); organization context 157-163 (permittedIn, databaseOf) and 360-377 (one machine's sign-out); remote-sync 150-156; shadcn-svelte reference 7-8, 37-45, 133-138 and frontend 53-54 (34 families, the folder count); plan 160 and 217 (the row menu, dated).*
- [x] `node .aep/scripts/validate.mjs` passes and the index is regenerated. *Verified: `node .aep/scripts/validate.mjs` printed 567 artifacts checked, no failures; `index.mjs` ran.*

## Relevant areas

- `.aep/rules/{interface,frontend}.md`, `.aep/contexts/desktop/{organization,remote-sync}.md`, `.aep/references/shadcn-svelte.md`

## Constraints

- Say what the code does now; no source change.
