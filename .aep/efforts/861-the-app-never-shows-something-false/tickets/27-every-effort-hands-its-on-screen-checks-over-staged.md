---
status: resolved
blocked-by: [26]
---

# docs(aep): every effort hands its on-screen checks over staged

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 12).

## Outcome

A project rule makes staging part of handing over an effort whose `## Needs you` holds an on-screen check, and a reference says how staging is run and how a state is written, so a later run does it without being told.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [x] A rule under `.aep/rules/` with a `use-when` that fires when an effort's `## Needs you` holds an on-screen check, requiring its states in a `_stage` worktree, each entered and screenshotted in both languages and both appearances, before the owner gets the window and the list. Verified: `.aep/rules/staging.md` fires on `an effort's ## Needs you holds a check the owner makes by looking at the interface, or an effort holding one is handed over`; it requires the states untracked in `.aep/worktrees/<effort>/_stage`, every one shot by `pnpm stage:shots` in both languages and appearances and looked at, defects fixed, `evidence/staging/needs-you.md` written, then `pnpm stage` and the list. `pnpm stage:shots` (6f9fa690) makes the shooting one command; a broken state fails it with exit 1.
- [x] A reference under `.aep/references/` on launching staging, writing a state, and what it cannot show. Verified: `.aep/references/stage.md`: the two commands, how the shell is stood in for (and that a new `tauri.ts` joins `ADAPTERS`), the mock records, a state's shape, the screen helpers, seven gotchas met in this effort, and *What it cannot show*.
- [x] [[rules/module-layout]] *Prototype code* and [[contexts/repository]] name the stage machinery; `node .aep/scripts/index.mjs && node .aep/scripts/aep.mjs check` passes. Verified: *Prototype code* gains *Staging is the other machinery there, and it is committed*; the repository context's `prototype/` row and `references/pnpm.md`'s run list name `stage/`, `pnpm stage` and `pnpm stage:shots`; index and check: 0 failures.

## Relevant areas

- .aep/rules/, .aep/references/, .aep/rules/module-layout.md, .aep/contexts/repository.md

## Constraints

- The rule tightens and never restates the protocol; it names [[skills/prototype/ui]] only to say staging is not variant judging.

## Notes
