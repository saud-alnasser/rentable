---
status: open
---

# fix(desktop): the roles block and its tests follow the rules

## Outcome

Review, round one, standards. The roles block breaks `rules/interface` in two places: a role card
opens the role editor, where *Row activation* says a row opens its record's page and names only the
members and workspaces directories as settings directories whose page is a sheet; and the list draws
its own head with no sort control and its create outside `directory-tray.svelte`, where *Sort*,
*Search* and *Create* say every list and settings directory has the bar. Beside those, comments and
test titles in the TypeScript the effort changed still describe administrators and the seven acts, a
test writes out a role fixture a shared builder already gives, the palette harness several modules
render lives in one module's tests, the new component tests stub `ResizeObserver` beside the helper
that already does, the member card's role reason is drawn outside the tray the rule says holds it,
and the role editor's comment cites a rule for a weight the rule does not name. After this, each
follows the rule it breaks, or the rule says why it does not.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 12.

- [ ] The roles block draws the settings directories' bar (`directory-tray.svelte`) with the one sort
      control (rank, the default, and name) and the create last at its end; its search filters by
      name; component tests for the order, the sort and the create.
- [ ] A role card opening its editor is named in `rules/interface`, *Row activation*, beside the
      members and workspaces directories, for the same reason (in the settings directories a record's
      page is its sheet), with the italic history.
- [ ] `rules/interface`, *Form surface*, names the role editor's weight and its reason, and the
      editor's comment cites it; the member card's role reason is drawn in the tray, with its test.
- [ ] The comments and test titles in the TypeScript the effort changed that describe an
      administrator, the seven acts or `changeRole` describe the present (a grep lists none that
      does not); `acts.test.ts` builds its roles from the shared `fakeOrganizationRole`; the palette
      harness lives in `apps/desktop/src/tests/` and is reached through `#tests/`; the new component
      tests use the shared `ResizeObserver` stub.
- [ ] `pnpm check`, `pnpm test`, root `pnpm lint`, `index.mjs` and `validate.mjs` pass.

## Relevant areas

- `src/lib/organization/component/roles.svelte`, `role-editor.svelte`, `member-role.svelte`, and their
  tests; `design/tests/acts.test.ts`; `layout/tests/palette-harness.svelte`, `src/tests/permission.ts`
- `platform/host.ts`, `organization/palette.ts`, `settings/component/area.svelte`, the settings,
  mark, members and palette tests the review names
- `.aep/rules/interface.md`, `.aep/rules/testing.md` if the shared fixtures' paragraph names them

## Constraints

- The design calls follow the minimal, guiding direction and Apple's HIG, made rather than offered.
