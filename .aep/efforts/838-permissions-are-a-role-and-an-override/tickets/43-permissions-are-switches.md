---
status: resolved
---

# feat(desktop): permissions are switches, and a custom member resets to their role

## Outcome

The human's call on the running application: the role editor is thirty checkbox rows, and the
member's card a three-column table whose checkbox means *differs from the role*, so the reader
works the arithmetic out. After this, both use one switch list grouped by kind of record, and a
member's card names the role, shows what they end up with, marks what differs, reads custom where
anything does, and resets to the role, as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Permissions as switches*, gives it.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `permission-switches.svelte` groups each kind under its icon with view as the main switch and
      add, edit and delete beneath it only while view is on; administration folds to a summary;
      the owner's acts are one line. The role editor and the member's card both use it, and the
      checkboxes and the three-column table are gone.
- [x] The member's card names the role, marks each switch that differs from it, shows *custom* when
      any does, and *reset to <role>* clears the override. Saving writes the override the switches
      come to.
- [x] A switch the reader may not change is dimmed with its reason; one sentence at the top says
      why; the rank and self reasons still read where they did.
- [x] `rules/interface`'s *Field kinds* names a permission as a switch, by the human's call; the
      design system's switch slides the right way in Arabic.
- [x] Component tests cover the groups, the view dependency, the custom mark and the reset, in
      English and Arabic.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/component/` (the roles block, role editor, member card),
  `packages/design/src/lib/primitive/switch/`, `src/lib/i18n`, `.aep/rules/interface.md`
