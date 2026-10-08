---
status: open
blocked-by: [06]
---

# fix(desktop): the schema forms report their changes

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Technical Approach, step 6*).

## Outcome

The nine forms built on superforms seed without tainting and pass `dirty` from their taint, so an untouched edit, duplicate or renew closes at once and a changed one asks.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (the schema forms).

- [ ] The complex, unit, contract, tenant and payment forms, the organization rename, the workspace rename, the workspace dialog and the member account form seed through `reset({ data, newState })`; async fills pass `{ taint: false }`; each passes `dirty={isTainted($tainted)}`.
- [ ] A tenant form test: an edit opened on a record closes without asking, and asks after a field changes. A contract form test does the same for renew and duplicate.
- [ ] In the running application the contract, tenant and payment forms ask only after a change; recorded under `## Needs you` for the close if the application cannot be driven.

## Relevant areas

- apps/desktop/src/lib/complex/component/form.svelte, complex/unit/component/form.svelte, contract/component/form.svelte, tenant/component/form.svelte, payment/component/form.svelte
- apps/desktop/src/lib/organization/component/rename-form.svelte, organization/workspace/component/rename-form.svelte, organization/workspace/component/dialog.svelte, organization/member/component/account-form.svelte
- apps/desktop/src/lib/form/form.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
