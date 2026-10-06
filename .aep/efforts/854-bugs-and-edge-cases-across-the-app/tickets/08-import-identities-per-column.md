---
status: open
---

# fix(desktop): tenant import treats national id and phone as unique on their own

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part one, *R6*).

## Outcome

Importing tenants names in the plan any row whose national id or phone is already held or repeats in the file, and the write never fails with a raw constraint error.

## Acceptance Criteria

Traces requirement 6 and criterion 6.

- [ ] `ImportField.identity` accepts `boolean | string`; identity groups are checked separately in `planImport` and in held names (`toHeldIdentities`).
- [ ] The tenant sheet uses one group per column; the tenant write reuses the checks `tenant.createMany` makes, factored into one function.
- [ ] Tests per criterion 6 in `transfer/tests/{import,transfer,router}.test.ts`; a single-group sheet behaves as before.

## Relevant areas

- `apps/desktop/src/lib/transfer/{import.ts,transfer.ts}`
- `apps/desktop/src/lib/tenant/{transfer.ts,tenant.ts,router.ts}`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
