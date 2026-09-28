---
status: resolved
blocked-by: [57, 58]
---

# fix(desktop): each layer on a member's sheet is titled by its scope

## Outcome

The human's call on the running application, 2026-09-28: the sections of a member's sheet say
where each reaches. They read *role*, then *organization permissions* (changes to their role
across the organization), then *workspace permissions* (which workspaces they can open, and
changes for each one alone). The sheet that adds a member uses the same titles.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The three sections are titled role, organization permissions and workspace permissions, each
      of the last two with a line saying its scope, in English and Arabic; a test.
- [x] The sheet that adds a member keeps the same titles; the line the old workspaces section
      carried is retired.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.
