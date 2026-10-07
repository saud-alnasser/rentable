---
status: open
blocked-by: [04, 10]
---

# feat(startup): an organization that cannot open returns to the switcher with its reason

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, `startup/`; Integration*).

## Outcome

An organization that cannot be opened, for its version or any other refusal, at launch, resume, sign-in, switching or joining, returns the person to the organization switcher with a short callout above that organization saying why in their language, carrying the update action when the reason is the version; a workspace below its read floor meets an update-required screen in place of the workspace that lets them switch to another; the generic error screen draws the reason it was given; and retrying never loops on the same refusal.

## Acceptance Criteria

Traces requirement 7, requirement 8, criterion 7 and criterion 8.

- [ ] `fail()`, `admit()`, `wall.ts`, `switch.ts` and the join flow route an organization's refusal (a version refusal, `heldByVersion`, or any other refusal to open it that is not about the password) to the organization switcher with the refusal recorded against that organization, never to the generic error screen and never to a wall the person cannot leave.
- [ ] The switcher draws a short callout above that organization with the reason sentence, and `update-action` as `notice` when the reason is the version; choosing another organization opens it, and the callout clears once that organization opens.
- [ ] A `held` state and `update-required` screen stand in place of a workspace below its read floor, with the reason sentence, `update-action` as `screen`, and a list of the session's other workspaces that switches to one; [[rules/interface]] *Application surfaces* is amended to say where it stands.
- [ ] `StartupError` draws the reason behind the existing detail disclosure; retry after a version refusal stays on the switcher callout or the update screen.
- [ ] Route or component tests for each entry, in Arabic and English, find the callout or the screen, the sentence, and switching working from each.

## Relevant areas

- apps/desktop/src/lib/startup/ (machine.ts, screen.ts, snapshot.ts, wall.ts, switch.ts, component/)
- the organization switcher on the way-in surface, apps/desktop/src/lib/organization/
- apps/desktop/src/lib/organization/setup/ (join)
- .aep/rules/interface.md

## Constraints

- Read [[contexts/desktop/components]] before choosing components; the callout is short and sits above the chosen organization (the human's words: "small callout above when the org is choose about the kind of error it has").
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]).
