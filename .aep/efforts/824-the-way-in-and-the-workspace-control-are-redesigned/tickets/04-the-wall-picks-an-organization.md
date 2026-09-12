---
status: resolved
---

# feat(layout): the wall picks an organization

## Outcome

A machine that has joined several organizations shows them on the wall as rows a person picks
from, each carrying its name and role, the password field under the chosen one. One organization
is named as today. The wall's shape does not otherwise move, and its unlock and password carry the
vocabulary.

## Acceptance Criteria

Traces requirement 7, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 7.

- [x] With two organizations, `startup-sign-in.svelte.test.ts` finds two `[role=radio]` rows
      each carrying name and role, the password field, and no `select`; pressing the second row
      and submitting calls `onSignIn` with the second organization's id. With one, the name and
      role render as the text line they are today. *Verified: `npx vitest run
      src/lib/layout/tests/startup-sign-in.svelte.test.ts` in `apps/desktop` printed `Tests 10
      passed (10)`; the two-organization cases assert two `[role=radio]`, name and role in each,
      `input[name=password]`, `querySelector('select')` null, and `onSignIn` called with the second
      id after pressing the second row; the one-organization case asserts the text line.*
- [x] The unlock button carries its verb glyph; the password field carries a muted leading glyph.
      *Verified: the same run, the case asserting `button svg` on the unlock button and
      `[data-slot=input-group-addon] svg` before the password input with the addon's class
      containing `text-muted-foreground`.*
- [x] The wall's title, description and password sentence are byte-identical to before.
      *Verified: `git diff 09dc7c70..HEAD -- apps/desktop/src/lib/i18n` on this branch is empty;
      the component reads the same `signIn.*` keys before and after.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified on the stack's tip on 2026-09-12:
      `pnpm check` in `apps/desktop` printed `9268 FILES 0 ERRORS 0 WARNINGS` and in
      `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx prettier --check .` printed `All
      matched files use Prettier code style!`, `npx eslint .` exited 0, `npx turbo run test --force`
      printed `Tasks: 4 successful, 4 total` (desktop node:test 899 pass, vitest 57 passed; design
      58 passed; turso-platform 21; workspace-permission 8). The root `pnpm check` wrapper cannot
      start in this worktree: pnpm 12.4.1 writes a task-state file whose path exceeds Windows'
      limit with long paths off, so its pieces were run one by one.*

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test;
`packages/design/src/lib/primitive/radio-group/` and `primitive/item/` are read, not changed.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The wall's picker is a radio group*, and the technical risk on the radio group
  inside the wall's form.**
- **The look is settled on screen against the human's two joined organizations**; ask before
  driving the app.
- **The wall's shape is the human's, settled 2026-08-20** (the component's own comment). Rows are
  drawn inside it; nothing else on the wall moves.
- **A changeset rides with the change.**

Seen on screen on 2026-09-12 at 22:39, launched from the run worktree on the human's own data:
this machine holds two joined organizations, both named `rentable` with the role `owner`, and the
wall drew them as two bordered rows, radio leading, name over the muted role, the chosen row
carrying the primary border and tint, the password field under the group. The capture was sent to
the human; their one remark was that two rows with one name cannot be told apart, and that is
recorded as a finding for a later effort rather than taken here, since the spec asks for name and
role. Where the machine held one organization (the first capture at 22:15) the text line rendered
as before.
