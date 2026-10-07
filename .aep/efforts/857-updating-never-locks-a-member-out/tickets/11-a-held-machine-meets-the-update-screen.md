---
status: open
blocked-by: [04, 10]
---

# feat(startup): a held machine meets the update screen

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `startup/`; Integration*).

## Outcome

A version refusal at launch, resume, sign-in, switching or joining lands on a new update-required screen that says why in the person's language, carries the update action, and lets them switch to another organization or workspace; the generic error screen draws the reason it was given; and retrying never loops on a version refusal.

## Acceptance Criteria

Traces requirement 7, requirement 8, criterion 7 and criterion 8.

- [ ] A `held` state and `update-required` screen exist; `fail()`, `admit()`, `wall.ts`, `switch.ts` and the join flow route a version refusal or `heldByVersion` to it.
- [ ] The screen is a way-in surface with the reason sentence, `update-action` as `screen`, the organization switcher, and a list of the session's other workspaces that switches to one; [[rules/interface]] *Application surfaces* is amended to rule it into the way-in surface.
- [ ] `StartupError` draws the reason behind the existing detail disclosure; retry after a version refusal stays on the update screen.
- [ ] Route or component tests for each entry, in Arabic and English, find the screen, the sentence and both switchers working.

## Relevant areas

- apps/desktop/src/lib/startup/ (machine.ts, screen.ts, snapshot.ts, wall.ts, switch.ts, component/)
- apps/desktop/src/lib/organization/setup/ (join)
- .aep/rules/interface.md

## Constraints

- Read [[contexts/desktop/components]] before choosing components.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
