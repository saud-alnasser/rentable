---
status: open
---
# feat(desktop): a complex whose units no contract holds is deleted with its units

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Requirement 22, added by the human on 2026-09-30. Today a complex is deleted only when it holds no unit (`complex/complex.ts`, `isComplexDeletable`, refusal `complex.holdsUnits`). From here a complex is deleted if and only if no contract, of any status, holds any of its units (every `contract_unit` row counts, as `whatRefusesUnitDeletion` already reads it). Deleting one that has units deletes them in the same write (one batch, so a refusal anywhere removes nothing). It needs `deleteUnit` as well as `deleteComplex` where there are units (`refuseMissing`), and none extra where there are none. It asks first, through the delete dialog, naming the units that go with it (the act's `confirmation` is `cascade` exactly when the complex has units; a complex with none still deletes at once with undo, per [[rules/interface]] *Delete and confirm*). It is undone whole: the complex and every unit back with their ids and every column a unit has. The same holds for a selection: `planMany`, `deleteMany` and its inverse `createMany` (which now puts units back too), and whatever the selection surface shows for a refused complex. A refused complex names the units a contract holds, in both locales, replacing the "holds units" sentence and refusal.

## Acceptance Criteria

Traces requirement and criterion 22 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 19.

- [ ] A complex with units, none held by a contract, is deleted with its units, one at a time and in a selection; a router test holds that the units are gone and that undoing puts the complex and each unit back as they were (criterion 22).
- [ ] A complex one of whose units any contract holds, terminated or expired included, is refused, at the procedure and in the plan a selection reads; the refusal names held units; a router test holds each (criterion 22).
- [ ] A member without `deleteUnit` is refused a complex with units and allowed one with none; a router test holds both (criterion 22).
- [ ] The delete asks, naming the units that go with it, where the complex has units, shows the refusal where a contract holds one, and runs at once with undo where it has none; a component or host test holds the three (criterion 22).
- [ ] The strings are in both locales' complex pieces, `en` and `ar` agree in shape, and no shared locale file changes (criterion 8).
- [ ] The integration gate passes on this commit; tests whose assertions change are only those requirement 22 changes, each named in the commit body (criterion 19).

## Relevant areas

- `src/lib/complex/` (`complex.ts`, `router.ts`, `acts.ts`, `query.ts`, `component/host.svelte`, `i18n/`, `tests/`), `src/lib/api/selection.ts`, `src/lib/act/`, the undo declaration for a complex's delete and `deleteMany`

## Constraints

- No workspace migration, and no table or column changes shape (criterion 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A changeset (`'@rentable/desktop': minor`) rides in the same commit, in the user's words.
