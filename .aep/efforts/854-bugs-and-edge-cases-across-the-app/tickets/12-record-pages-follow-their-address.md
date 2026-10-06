---
status: resolved
---

# fix(desktop): record pages follow their address

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *2*).

## Outcome

Every record page shows the record its address names, after a renewal, a palette jump, a link or the back button between two records of one kind.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [x] The six record routes read `$derived(page.params.id)` inside `{#key}`, as `settings/workspaces/[id]` does.
- [x] A Vitest route test per criterion 2 changes the parameter and sees the second record.

## Relevant areas

- `apps/desktop/src/routes/{tenants,contracts,complexes,complexes/units,contracts/payments,contracts/units}/[id]/+page.svelte`
- `apps/desktop/src/routes/tests/`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
