---
status: open
blocked-by: [02]
---

# fix(organization): asking for the Turso group keeps what the owner typed

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The group field keeps the form*).

## Outcome

When a create is refused because Turso needs the group named, the walk's name step keeps the organization's name, the username, the password and its confirmation as typed, adds the group field with its sentence, and focuses it; creating again sends the kept values with the group.

## Acceptance Criteria

Traces requirement 30 and criterion 30.

- [ ] **First, a failing test** of the first run through the real create path: the create mutation refuses with the group asked for, and the test asserts the four fields still hold what was typed. It fails on the current code for the reason found, and the cause is named in the commit body.
- [ ] The fix is where the cause is; the same test passes, and asserts the group field is shown and focused.
- [ ] Filling the group and creating again calls the create with the kept name, username and password and the typed group.
- [ ] The existing walk and first-run tests pass, including the rerender test of the group field; any other failed create that keeps the form today still keeps it.
- [ ] A changeset.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{first-run.svelte,walk.svelte,name-step.svelte}`
- `apps/desktop/src/lib/organization/setup/{setup.ts,tests/first-run.svelte.test.ts,tests/walk.svelte.test.ts}`

## Constraints

- [[skills/implement/diagnosing]]: build the failing signal before the theory.
- The form state stays in the walk; no copy of the values in the route.
