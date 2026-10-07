---
status: open
blocked-by: [07]
---

# feat(organization): the upgrade sheet, and a capability waits for its upgrade

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Components, frontend `organization/upgrade/`*).

## Outcome

Settings marks an organization or workspace that has an upgrade available to someone who may run it, the upgrade sheet shows what it changes and who is behind with not yet and upgrade now, and a capability gated with `useUpgraded(step)` shows its reason and who can upgrade until the step has run.

## Acceptance Criteria

Traces requirement 1, requirement 3, criterion 1 and criterion 3.

- [ ] The mark appears on the organization card and each workspace card only for a holder of `upgradeData` with a pending upgrade step.
- [ ] The sheet is an edge panel per [[contexts/desktop/components]], lists the steps' sentences, the machines it would stop and make read-only (member, machine, rentable version) and, under its own heading, those not seen since a date; not yet changes nothing; upgrade now runs and reports through the usual outcome.
- [ ] `useUpgraded(step)` answers from the data's level; a component test shows a gated control with its reason, naming who can upgrade, and the control available after the run.
- [ ] Every sentence exists in Arabic and English; component tests cover the sheet's three lists and both choices.

## Relevant areas

- apps/desktop/src/lib/organization/ (new `upgrade/`)
- the settings organization and workspace cards
- apps/desktop/src/lib/organization/i18n/

## Constraints

- Read [[contexts/desktop/components]] and [[rules/interface]] before choosing a component.
- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
