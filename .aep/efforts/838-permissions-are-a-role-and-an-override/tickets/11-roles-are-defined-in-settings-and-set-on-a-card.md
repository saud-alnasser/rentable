---
status: resolved
blocked-by: [08]
---

# feat(organization): roles are defined in settings and set on a member's card

## Outcome

The organization section of the settings area lists roles by rank with their flags grouped by
family, and a role editor in the edge panel creates, renames, moves, edits and deletes them. The
member sheet sets a member's role and override and shows, per flag, the role's value, the override
and the result. Every "administrator" a person reads says "manager", and the vocabulary's old aliases
are removed.

## Acceptance Criteria

Traces requirements 3 and 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 12.

- [x] A roles block in the organization section, and the role editor as an edge panel, per
      [[rules/interface]]; component tests for the order, the grouping, and each write calling its
      command.
- [x] The member sheet's role picker and override editor replace the segmented control and
      `member-acts.svelte`; a component test shows role, override and result for a flag the override
      flips each way.
- [x] A control the viewer may not use is disabled with its reason (rank, self, or the flag), with a
      component test for each reason.
- [x] `role-table.svelte` is removed; "administrator" appears in no `i18n/en` or `i18n/ar` value;
      `ADMINISTRATION`, `ADMINISTRATION_BY_ROLE`, `EVERY_ADMINISTRATION` and `changeRole` have no
      importer and are deleted.
- [x] Criterion 12 is handed to the human at the close, on the running application.

## Relevant areas

- `src/lib/organization/component/` (`member-sheet`, `member-role`, `member-acts`, `account-form`,
  `role-table`), `organization/acts.ts`, `settings/section.ts`, `workspace/permitted.ts`
- `src/lib/i18n/en/index.ts`, `src/lib/i18n/ar/index.ts`

## Constraints

- The design calls follow the minimal, guiding direction and Apple's HIG, made rather than offered.
