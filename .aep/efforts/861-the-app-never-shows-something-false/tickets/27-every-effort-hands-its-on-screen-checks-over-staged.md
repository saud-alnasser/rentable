---
status: open
blocked-by: [26]
---

# docs(aep): every effort hands its on-screen checks over staged

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 12).

## Outcome

A project rule makes staging part of handing over an effort whose `## Needs you` holds an on-screen check, and a reference says how staging is run and how a state is written, so a later run does it without being told.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [ ] A rule under `.aep/rules/` with a `use-when` that fires when an effort's `## Needs you` holds an on-screen check, requiring its states in a `_stage` worktree, each entered and screenshotted in both languages and both appearances, before the owner gets the window and the list.
- [ ] A reference under `.aep/references/` on launching staging, writing a state, and what it cannot show.
- [ ] [[rules/module-layout]] *Prototype code* and [[contexts/repository]] name the stage machinery; `node .aep/scripts/index.mjs && node .aep/scripts/aep.mjs check` passes.

## Relevant areas

- .aep/rules/, .aep/references/, .aep/rules/module-layout.md, .aep/contexts/repository.md

## Constraints

- The rule tightens and never restates the protocol; it names [[skills/prototype/ui]] only to say staging is not variant judging.

## Notes
