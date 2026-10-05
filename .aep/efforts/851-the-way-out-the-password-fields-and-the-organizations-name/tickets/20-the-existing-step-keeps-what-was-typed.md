---
status: resolved
---

# fix(organization): the owner's connect to an existing organization keeps what they typed

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 40, criterion 40). *Added by the human 2026-10-06; the same cause ticket 12 found, on the step beside it.*

## Outcome

A refused connect on the walk's existing step leaves the username and the password in their fields, with the refusal beside them, as `first-run.svelte` already says it does.

## Acceptance Criteria

Traces requirement 40 and criterion 40.

- [x] **First, a failing test** of the first run through the real connect path (the `applyAction` the test owns, as ticket 12's), refusing the connect and asserting both fields keep what was typed.
- [x] The `setup-existing` form stops resetting after a caught refusal; the same test passes and shows the refusal.
- [x] `pnpm test` and `pnpm check` pass; a changeset.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{walk.svelte,first-run.svelte,existing-step.svelte}`, `organization/setup/tests/first-run.svelte.test.ts`
