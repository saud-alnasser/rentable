---
status: resolved
---

# fix(desktop): a locked member with no workspace is told the account is locked

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 32, criterion 32). *Appended by converge, round one, 2026-10-05.*

## Outcome

A locked member who lands on the no-workspace screen reads the same locked sentence the workspace shell shows, and it is gone once they are unlocked.

## Acceptance Criteria

Traces requirement 32 and criterion 32 (the locked sentence).

- [x] The no-workspace screen draws the locked notice (`organization/component/locked-notice.svelte`) for a locked session and not for an unlocked one, placed per [[contexts/desktop/components]] and [[rules/interface]].
- [x] A component test of the no-workspace screen in English and Arabic, locked and unlocked.
- [x] `pnpm test` and `pnpm check` pass.

## Relevant areas

- `apps/desktop/src/lib/startup/component/no-workspace.svelte`, `src/lib/organization/component/locked-notice.svelte`, `src/lib/startup/tests/`
