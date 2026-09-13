---
status: resolved
---

# refactor(layout): the wall carries the vocabulary

## Outcome

The wall's unlock carries its verb glyph and its password field a muted leading key through
`input-group`, and nothing else on the wall moves: a machine that has joined several organizations
still shows them in the select, one organization is still named as a line of text, and the title,
description and password sentence are what they were.

## Acceptance Criteria

Traces requirement 7, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 7.

- [x] The unlock button carries its verb glyph; the password field carries a muted leading glyph
      inside `input-group`. *Verified: `npx vitest run
      src/lib/layout/tests/startup-sign-in.svelte.test.ts` in `apps/desktop` on 2026-09-13, the case
      asserting `button svg` on the unlock button and `[data-slot=input-group-addon] svg` before the
      password input with the addon's class containing `text-muted-foreground`.*
- [x] With two organizations, `startup-sign-in.svelte.test.ts` finds the select naming the first,
      no `[role=radio]`, and the password field; with one, the name and role render as the text
      line. *Verified: the same run; the two-organization case asserts `[data-slot=select-trigger]` with the
      first name, `queryAllByRole('radio')` empty and `input[name=password]`; the one-organization
      case asserts the `p` line.*
- [x] The wall's title, description and password sentence are byte-identical to before.
      *Verified: `git diff origin/main -- apps/desktop/src/lib/i18n` carries no `signIn.*` change;
      the component reads the same keys.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified 2026-09-13 on the commit that takes
      the rows out, in the run worktree: the figures are in the pull request's run log.*

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test;
`packages/design/src/lib/primitive/input-group/` is read, not changed.

## Constraints

- **The wall's shape is the human's, settled 2026-08-20** (the component's own comment). Nothing
  on it moves but the glyphs.
- **A changeset rides with the change.**

## Notes

**This ticket was cut as feat(layout): the wall picks an organization**, requirement 7 as first
written: several organizations as radio rows carrying name and role, the password field under
the group, built and seen on screen on 2026-09-12 against the human's two joined organizations
(both named `rentable`, both `owner`). On 2026-09-13, testing the effort from the run worktree,
the human said the organization login page felt off and gave the order the way in should take:
connect to an organization once, one signed in to at a time, then a login page of username and
password, then the organization's workspaces. Choosing between organizations is a page before the
wall in that picture, not a list on it, and they chose to withdraw the rows from this effort
rather than merge them and redraw later. A commit on top of the effort's history takes the rows
and their tests out, since the branch is not rewritten once pushed; the select 819 left is what
several organizations show, and the glyphs are what remains of the ticket. The wider picture is recorded under the spec's Out of Scope, for a `/specify` of its own.

The finding from the capture, that two organizations with one name cannot be told apart, goes
with the rows: it is that later effort's, where the organizations are listed.
