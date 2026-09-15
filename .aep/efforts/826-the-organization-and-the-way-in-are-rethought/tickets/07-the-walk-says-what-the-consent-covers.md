---
status: resolved
---

# feat(organization): the walk says what the consent covers

## Outcome

The first run's connect step no longer asks the owner to create a group. Its three statements
say that the consent covers every database in the group chosen, that a Free or Developer
account has exactly one group so a Turso account for rentable alone is the clean choice and a
paid account should offer an empty one, and what succession costs, shorter than today.

## Acceptance Criteria

Traces requirement 13 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
and its criterion 13.

- [x] `organization/setup.ts`'s `SetupStatement` is `groupCoverage`, `accountCreation`,
      `succession`; `setup.test.ts` pins the three English statements as literals and the
      Arabic three beside them, and its vocabulary guard finds no instruction to create a
      group in either.
- [x] The connect step renders the three as the glyphed list 824 built, the dashboard action
      still inside the first item, and `setup-walk.svelte.test.ts` asserts it.
- [x] Both locales are written, not copied; the two research files under the effort's
      `evidence/research/` are cited in the ticket's commit body as where the one-group fact
      comes from.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/src/lib/organization/{setup.ts,component/setup-walk.svelte}`,
`i18n/{en,ar}/index.ts`, `organization/tests/{setup,setup-walk.svelte}.test.ts`.

## Constraints

- **Nothing but strings and the statement keys changes**; the walk's steps, fields and back
  controls are 824's and stay.
- **The succession fact is 819's requirement 22** and is shortened, not rewritten.

## Notes

Nothing yet.
