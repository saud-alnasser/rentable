---
status: resolved
---

# fix(organization): the settings disconnect names the Turso consent only where this machine holds it

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 5, criterion 5). *Appended by converge, round one, 2026-10-05.*

## Outcome

The disconnect in the organization tab's leaving card asks through the same confirm as the wall's switcher, and says the Turso account is forgotten only where this machine holds that organization's consent; a member, and an owner whose consent is not on this machine, are not told it.

## Acceptance Criteria

Traces requirement 5 and criterion 5.

- [x] `organization/component/disconnect.svelte` takes whether this machine holds the organization's consent and passes it to `DisconnectDialog` as `forgetsTurso`; `leaving.svelte` passes its `holdsTursoAuthority`.
- [x] A component test: the leaving card's disconnect confirm carries the Turso clause for an owner holding the consent, and not for a member nor for an owner without it.
- [x] `pnpm test` and `pnpm check` pass.

## Relevant areas

- `apps/desktop/src/lib/organization/component/{disconnect.svelte,leaving.svelte,disconnect-dialog.svelte}`, `src/lib/app/tests/settings-area.svelte.test.ts`
