---
status: open
---

# docs(desktop): the look of the way in and the workspace menu is judged on screen

## Outcome

The human has looked at the way-in surface, the welcome, the name step and the workspace menu. Each
is drawn on the prototype switcher against the developer database, in English and Arabic, light and
dark, and the human has said which look is built. What they chose, and anything they changed, is
recorded in an evidence file. The tickets after this one are corrected to match before any of them
is started.

## Acceptance Criteria

Traces requirements 1, 2, 10 and 11 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
its criteria 1, 2, 10 and 11, and its constraint that the look is judged on screen before it is
built across the way in.

- [ ] One design per surface is built on `apps/desktop/src/lib/prototype/switcher.svelte`, with no
      layout options offered:
      - the way-in column: the mark, title, description, position, fields without glyphs and one
        prominent action;
      - the welcome's equal pair;
      - the name step;
      - the workspace trigger and menu, with a check on the open workspace. The menu reads the real
        held workspaces.
- [ ] Each is screenshotted in the four combinations of locale and appearance and shown to the
      human, who says what is built.
- [ ] `evidence/prototypes/the-look-of-the-way-in.md` records what was shown, what the human chose,
      what they changed, and the date.
- [ ] In the same commit, tickets 02 to 11 are corrected wherever the choice differs from what they
      say.
- [ ] In the same commit, the prototype components are deleted from `src/lib/prototype/`.

## Relevant areas

- `apps/desktop/src/lib/prototype/switcher.svelte`
- `packages/design/src/lib/block/standalone-surface.svelte`, `startup/component/sign-in.svelte`,
  `organization/setup/component/name-step.svelte`, `workspace/component/menu.svelte`

## Constraints

- **Ask the human before launching or driving the app** while they are at the machine.
- Use real query data only, never hand-written samples.
- Design calls follow Apple's guidance first and cite the page
  ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/research/what-apple-does-for-the-way-in-and-the-workspace-control]]).
  Lean on Refactoring UI where its navigation file routes a question.

## Notes

The spec said the look is judged before build tickets are cut. The human asked for the tickets on
2026-09-30, before the prototype ran. So this ticket gates every build ticket by edge instead, and
the spec's constraint was corrected to say so.
