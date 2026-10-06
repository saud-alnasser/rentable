---
status: open
---

# fix(desktop): an update download survives leaving the settings tab

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *13*).

## Outcome

Leaving the general settings tab while an update downloads neither cancels nor forgets it, and restart cannot be pressed twice.

## Acceptance Criteria

Traces requirement 13 and criterion 13.

- [ ] Update state lives in a module-level `settings/update-download.svelte.ts`; the card no longer closes the handle on destroy.
- [ ] Restart is disabled while its mutation is pending.
- [ ] A Vitest test per criterion 13.

## Relevant areas

- `apps/desktop/src/lib/settings/component/updates.svelte`
- `apps/desktop/src/lib/settings/`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
