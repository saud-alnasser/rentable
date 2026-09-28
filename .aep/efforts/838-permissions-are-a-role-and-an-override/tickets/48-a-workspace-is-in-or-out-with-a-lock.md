---
status: resolved
---

# feat(desktop): a workspace is in or out, with a lock to read-only

## Outcome

The human's call on the running application: a member's card offers full access, read-only and no
access per workspace beside a role, which reads as a second permission system. After this, as
[[efforts/838-permissions-are-a-role-and-an-override/plan]], *A workspace is in or out, with a lock*, gives it, each workspace is one switch,
in or out, and beneath one that is in, an owner-only switch locks it to read-only and says what
that means.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The member's card and the add-member form draw each workspace as a switch; on grants full
      access, off withdraws, through the existing acts; the level choice is gone.
- [x] Beneath a workspace switched on, *lock to read-only* re-grants it read-only, and unlocking
      re-grants full access; its line says the member cannot change anything there, even outside
      the application. For anyone but the owner it is dimmed with the reason.
- [x] Refusals (grantWorkspace, withdrawing, rank) stay at their controls with their reasons.
- [x] English and Arabic; `rules/interface` and `contexts/desktop/organization` say what the card
      now draws; component tests cover in, out, lock, unlock and each refusal.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/component/` (the member's workspaces, account form), `src/lib/i18n`,
  `.aep/rules/interface.md`, `.aep/contexts/desktop/organization.md`
