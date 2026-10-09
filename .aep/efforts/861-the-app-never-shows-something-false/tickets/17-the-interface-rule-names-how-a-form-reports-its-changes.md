---
status: resolved
---

# docs(aep): the interface rule names how a form reports its changes

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 10, *Constraints*: a rule this changes is changed in the same effort). Found at converge round 1.

## Outcome

[[rules/interface]], under *Form surface*, says how a form tells the surface it has changes: a schema form opens through `seed` and reports its taint, and a form without a schema compares a snapshot taken at open through `isDirty`, so the next form written follows one of the two.

## Acceptance Criteria

Traces requirement 10.

- [x] *Form surface* in `.aep/rules/interface.md` names `seed` (`$lib/form`) for a schema form and `isDirty` (`$lib/form`) for a form without one, and says a preview with nothing to lose passes no `dirty`. Verified: the diff adds to *Form surface* that a schema form opens through `seed` from `$lib/form` and passes its taint, a form without a schema passes `isDirty` from `$lib/form` of snapshots, and a preview with nothing to lose passes no `dirty`; checked against `form/form.ts`, `form/dirty.ts` and `form/index.ts`.
- [x] `node .aep/scripts/validate.mjs` reports no failures. Verified: the child's run printed "733 artifacts checked, no failures", exit 0.

## Relevant areas

- .aep/rules/interface.md

## Constraints

- No changeset: nothing here is observable by a user.

## Notes
