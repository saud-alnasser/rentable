---
status: resolved
blocked-by: [57, 58]
---

# fix(desktop): each layer on a member's sheet is titled by its scope

## Outcome

The human's call on the running application, 2026-09-28: the sections of a member's sheet say
where each reaches and that the last two are overrides. They read *role*, then *organization
override* (overrides their role across the organization), then *workspace overrides* (which
workspaces they can open, and in each one, overrides of their organization permissions). The sheet
that adds a member uses the same titles. *Worded as overrides at the human's second call.*

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The three sections are titled role, organization override and workspace overrides, each
      of the last two with a line saying its scope, in English and Arabic; a test.
- [x] The sheet that adds a member keeps the same titles; the line the old workspaces section
      carried is retired.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.
