---
status: resolved
blocked-by: ['02', '03', '04', '05', '06']
---

# refactor(organization): the vocabulary is swept

## Outcome

Every screen and dialog in the effort's scope carries the same vocabulary: primary buttons with
their verb, fields with their subject, muted. The change-password form, and any button or field the
earlier tickets left bare, are brought to it, and the tests hold every screen to it.

## Acceptance Criteria

Traces requirement 14, requirement 15 and requirement 16 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 14,
criterion 15 and criterion 16.

- [x] `change-password-form.svelte` renders muted leading glyphs on its three password fields and
      a verb glyph on its change button; `change-password.svelte.test.ts` asserts them.
      *Verified: the three password fields go through `input-group` with a muted `key-round` addon
      and the change button carries `refresh-cw`; `npx vitest run
      src/lib/organization/tests/change-password.svelte.test.ts` in `apps/desktop` printed `6
      passed`, the new case asserting `svg` inside the named change button and, for `current`,
      `next` and `confirmation`, `[data-slot=input-group-addon]` before the input holding an `svg`
      and carrying `text-muted-foreground`.*
- [x] Every screen in scope has a component test asserting `svg` before the named primary button's
      label and `[data-slot=input-group-addon] svg` before each named input with
      `text-muted-foreground` on the addon; the continue arrow's class contains `rtl:rotate-180`.
      *Verified: `grep -ln input-group-addon apps/desktop/src/lib/*/tests/*.svelte.test.ts` lists
      `startup-sign-in` (the wall and the no-workspace surface), `change-password`, `invite-form`
      (with the organization page's openers), `join-screen`, `setup-walk` and `workspace-dialog`;
      each asserts the named primary button's `svg` and the addon before each named input with
      `text-muted-foreground`; `setup-walk.svelte.test.ts` asserts the continue arrow's
      `rtl:rotate-180`. The rail menu's rows are radio items, not buttons, and carry the primitive's
      marker.*
- [x] A read of both locales for every string the effort added, recorded under Notes with anything
      corrected.
      *Verified: `git diff 09dc7c70 -- apps/desktop/src/lib/i18n/{en,ar}/index.ts` read line by line
      on 2026-09-12; the record is under Notes.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.
      *Verified: on the stack's tip on 2026-09-12: `pnpm check` in `apps/desktop` printed `9277
      FILES 0 ERRORS 0 WARNINGS` and in `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx
      prettier --check .` printed `All matched files use Prettier code style!`, `npx eslint .`
      exited 0, `npx turbo run test --force` printed `Tasks: 4 successful, 4 total` (desktop
      node:test 901 pass, vitest 79 passed), and `cargo test` in `apps/desktop/tauri` printed `test
      result: ok. 281 passed; 0 failed; 10 ignored`. The root `pnpm check` wrapper cannot start in
      this worktree (pnpm 12.4.1 task-state path over Windows' limit), so its pieces were run one by
      one.*

## Relevant areas

`apps/desktop/src/lib/organization/component/change-password-form.svelte` and its test; every
component the earlier tickets touched, read for what they left bare.

## Constraints

- **Cite *Balance weight and contrast* (p.56)** on any glyph whose colour is chosen here.
- **Every glyph is Lucide or Tabler where each is already used**; no third set.
- **A changeset rides with the change** only where a screen changes visibly; a test-only sweep
  needs none.

## Notes

Last, so it sweeps finished screens rather than being redone as each moves.

**The sweep, 2026-09-12.** Three things were bare or at odds: the change-password form had plain inputs and a bare button; the join screen led its password fields with `lock` while the wall and the walk led theirs with `key-round` (the key is the field's subject and the open lock is the unlock verb, so the join screen took the key); and the workspaces section on the organization page said the no-workspace surface's sentence, which speaks of the first workspace, under a list that already held some, so it says the rail menu's owner sentence instead. `setup.linkLabel`, the one string of the retired done step still read, moved beside its reader as `organization.dashboard.linkLabel` in both locales.

**The locale read.** Every string the effort added, English against Arabic: `layout.workspaceMenu.{switchTo, open, inviteRefused, workspaceRefusedOwner, workspaceRefusedAuthority}`, `organization.setup.{position, connectGroup, connectAccount, connectSuccession, workspaceTitle, workspaceDescription, back}`, `organization.join.back`, `organization.dashboard.{emailInvalid, nameRequired, linkLabel}`. Each Arabic string says what its English says, in the neighbouring strings' register (imperatives addressed to the reader, Turso and rentable kept as names, Arabic-Indic digits through the number formatter on the position line); `open` is feminine to agree with مساحة العمل, the noun it marks. Nothing was corrected. Removed with their step: `setup.{groupPreparation, accountCreation, succession, doneTitle, doneDescription, notYetSent}` and `join.pasteAnother`.

**Review, 2026-09-13.** Four standards findings landed here as part of the sweep. The
placeholder `DesignStrings` fixture that five test files each wrote out is one module,
`design/tests/strings.ts`, as the testing rule asks of a fixture for a declared interface. The
explicit `aria-hidden` on addon glyphs went, since `@lucide/svelte` sets it by default and four
files had it where two did not. The wall's citation of *Balance weight and contrast* takes the
italic form the other citations use. And the connect list's glyph is centred on the sentence's
first line by a `h-5` box rather than an `mt-0.5` off the spacing ladder. The second round found the
page's workspaces section saying the owner sentence to an owner whose machine lacks the
authority, once its opener was gated as the rail's row is; the section takes the refusal
sentence composed by the page, the two the sidebar composes, and draws it without deciding.
