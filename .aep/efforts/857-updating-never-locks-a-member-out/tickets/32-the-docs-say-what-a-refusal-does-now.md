---
status: resolved
blocked-by: [31]
---

# docs: the rules and contexts say what a refusal does now

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round two (standards 1, 4, 5, 6): the rules, contexts, names and changesets describe the workspace-held screen and the switcher as tickets 25 and 31 left them.

## Acceptance Criteria

Traces requirement 7 and requirement 8.

- [x] [[rules/interface]] describes both kinds of workspace hold (the version, with the update action; any other refusal, with try again), and [[contexts/desktop/organization]] says which refusals return a person to the switcher and which keep them in, including a link refused while in another organization.
- [x] `workspace-held.svelte`'s comment opens with what it now stands for, and the update action's `detailsKey` is named for the update concept.
- [x] `.changeset/a-version-check-never-guesses.md` and `the-opening-judges-before-it-writes.md` read as release notes in a user's words.
- [x] `node .aep/scripts/validate.mjs` passes.

## Relevant areas

- .aep/rules/interface.md, .aep/contexts/desktop/organization.md, persistence.md
- apps/desktop/src/lib/startup/component/workspace-held.svelte, src/lib/update/component/update-action.svelte, .changeset/

## Constraints

- No changeset of its own.
