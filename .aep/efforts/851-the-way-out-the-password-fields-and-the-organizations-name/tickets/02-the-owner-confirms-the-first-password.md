---
status: open
blocked-by: [01]
---

# feat(organization): the owner types the first password twice

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The owner's confirmation*).

## Outcome

The setup walk's name step asks for the owner's password and then for it again. The organization is not created while the two differ, and the confirmation field carries the walk's own field error saying so.

## Acceptance Criteria

Traces requirements 17 and 18, and criteria 17 and 18.

- [ ] `SetupField` and `SETUP_WALK` in `organization/setup/setup.ts` include `confirmation` after `password`; `data-setup-fields` and the walk's description follow.
- [ ] The walk's `SetupSchema` (`organization/setup/component/walk.svelte`) carries `confirmation` and a `superRefine` putting a mismatch on `['confirmation']` with `organization.join.mismatch`; the defaults object and the `SuperForm` type in `name-step.svelte` include it.
- [ ] `name-step.svelte` draws the confirmation under the password with the password block (ticket 01), labelled `organization.join.confirmLabel`, `autocomplete="new-password"`, its error through `FieldError`.
- [ ] `walk.svelte.test.ts`: a password and a different confirmation do not call the create, and the confirmation field is marked invalid with the mismatch sentence; matching values create as today. Its field-list assertions are updated for the new field.
- [ ] The join and change-password tests pass unchanged (criterion 18).
- [ ] A changeset.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/{setup.ts,component/walk.svelte,component/name-step.svelte}`
- `apps/desktop/src/lib/organization/setup/tests/walk.svelte.test.ts`
- `apps/desktop/src/lib/tenant/component/form.svelte` for the `superRefine` precedent

## Constraints

- The confirmation is never sent past the form; `onUpdate` passes the password alone, as today.
