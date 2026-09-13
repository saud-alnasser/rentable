---
status: open
---

# spike(design): the settings area is seen on screen before it is built

## Outcome

The section rail, the members list with an active row and a pending row, and the invite
result panel with one link are drawn in the running application against the human's own
organization and judged there; what was settled and what was withdrawn is written up under
the effort's `evidence/prototypes/` and the prototype code is deleted.

## Acceptance Criteria

Traces requirement 14, requirement 15 and requirement 8 (the result panel) of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its constraint *Looks
are settled on screen, on real data*; it gates criterion 14, criterion 15 and criterion 16.

- [ ] A prototype under `src/lib/prototype/`, driven by `pnpm prototype`, draws the settings
      frame with the rail of seven sections in the sidebar menu button style, a members list
      with the fields of requirement 15 including a pending row with its expiry and copy
      control, and the invite result panel with one link and its copy control, on the real
      query data of the human's organization.
- [ ] The human looks at each of the three on screen and says what stays and what changes; the
      write-up `evidence/prototypes/the-settings-area-on-screen.md` follows
      `[[templates/prototype.template]]` and records both, with captures where the judgement
      turned on one.
- [ ] The prototype code is deleted; `git status` is clean of it.

## Relevant areas

`apps/desktop/src/lib/prototype/switcher.svelte`, `apps/desktop/scripts/prototype.mjs`;
`packages/design/src/lib/primitive/sidebar/sidebar-menu-button.svelte`
(`sidebarMenuButtonVariants`), `primitive/field/**`, `primitive/avatar/**`,
`primitive/badge/**`; `.aep/position/design/refactoring-ui.pdf` where present.

## Constraints

- **[[rules/module-layout]], *Prototype code***: untracked, under `src/lib/prototype/`, deleted
  once answered.
- **[[rules/interface]], *The visual reference***: open the reference for the rail and the row;
  say so where it is not there.
- **Driving the running application is asked for first** where the human is at the machine;
  the on-screen judgement is theirs.

## Notes

Cut because the spec's constraint requires it and the two screen tickets that follow declare it
as a gate; a child building this stops at the judgement and reports, since the judgement is
the human's.
