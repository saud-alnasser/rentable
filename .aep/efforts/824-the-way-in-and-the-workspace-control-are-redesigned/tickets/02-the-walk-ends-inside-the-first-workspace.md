---
status: resolved
blocked-by: ['01']
---

# feat(organization): the walk ends inside the first workspace

## Outcome

The first run is connect, name, workspace. Each step says where it is and can be left by a control
in the card's corner; the connect step is three glyphed facts with the dashboard action on the
first; a machine that already holds Turso authority finds connect granted; and creating the
workspace on the third step lands the owner in the application with it open. The done step and
its link are gone; the link is on the organization page.

## Acceptance Criteria

Traces requirement 1, requirement 2, requirement 3, requirement 4, requirement 5, requirement 6,
requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 1, criterion 2, criterion 3,
criterion 4, criterion 5 and criterion 6.

- [x] `SETUP_STEPS` is `connect`, `name`, `workspace`; `SetupField` gains `workspace`;
      `setup.test.ts` holds `fieldsPresented` to `name`, `password`, `workspace` and the
      vocabulary guard still finds no slug, group, token or url. The test that said the link is the
      last step is rewritten to say the workspace is.
      *Verified: `node --import tsx --test src/lib/organization/tests/setup.test.ts` in
      `apps/desktop` printed `tests 8, pass 8, fail 0`, among them `the only fields the walk
      presents are the name, a password and the workspace`, `nothing in the walk asks for a slug, a
      group, a token or a URL` and `the walk is three steps, and the workspace is the last`.*
- [x] On `connect` and `name`, exactly one `getByRole('button', { name: back })` renders in the
      surface's corner and its click calls `onBack`, and on `workspace` none renders; the outline
      back button is gone (`grep` in the gate). The route's `onBack` goes to `THE_WAY_IN` from
      `connect` and to the previous step otherwise, and stops at `workspace`. *This said the third
      step carried a back to `name`; the correctness review traced that to a second organization,
      and the human decided on 2026-09-13 that the third step has none (spec requirement 1).*
      *Verified: `npx vitest run src/lib/organization/tests/setup-walk.svelte.test.ts` printed
      `Tests 14 passed (14)`; the per-step case loops the two steps before `workspace`, asserts one
      `getByRole('button', { name: back })` outside `[data-setup-step]`, the arrow's
      `rtl:rotate-180`, and `onBack` called once; `grep -n 'variant="outline"' setup-walk.svelte`
      printed nothing; `back()` in `routes/organization/new/+page.svelte` is `goto(THE_WAY_IN)` on
      `connect` and the previous step otherwise (routes are not rendered under vitest here).*
- [ ] With a consent pending, back is enabled and pressing it reaches the wall; verified once on
      the human's account with the browser consent left open, and recorded under Notes.
- [x] Every step renders the position line "step n of 3", muted, in both locales.
      *Verified: the same run's case compares each step's `[data-setup-position]` text to
      `i18nObject(locale).organization.setup.position({ step, total: 3 })` for `en` and `ar` and
      asserts `text-muted-foreground`.*
- [x] The connect step renders three `li` each with an `svg`, the dashboard link inside the
      first, and no `p` outside the list; the three English items together are shorter than the
      three paragraphs they replace, pinned as a literal in `setup.test.ts`.
      *Verified: the same run: three `li` each holding an `svg`, the dashboard link inside the
      first, `body.querySelectorAll('p')` empty; `setup.test.ts` pins the three old paragraphs as a
      literal and counts 76 words against 108.*
- [x] With `holdsTursoAuthority: true` the connect step renders granted on first render with
      continue and disconnect, and `onConnect` is never called. The route passes
      `stateQuery.data?.holdsTursoAuthority`.
      *Verified: the same run with `holdsTursoAuthority: true`: the granted callout, continue and
      disconnect present, no connect button, `onConnect` never called; the route passes
      `stateQuery.data?.holdsTursoAuthority ?? false`.*
- [x] The third step renders the shared workspace fields; on create, the route calls the workspace
      mutation, then `goto(THE_WAY_IN)` and `startup.standingChanged()` in the order the old
      done step's `next()` used; `startup.test.ts` holds that `standingChanged` after a create
      opens the one workspace and reaches `ready`. Verified once by hand for the whole first run.
      *Verified: the same run: the third step renders `input[name=name]` inside the group with the
      create button, and no `[data-join-link]`; the route's `createFirstWorkspace` awaits the
      mutation, then `goto(THE_WAY_IN)`, then `startup.standingChanged()`; `node --import tsx --test
      --experimental-test-module-mocks src/lib/layout/tests/startup.test.ts` printed `tests 31, pass
      31, fail 0`, the new case seeing `loading`, then `ready` with `workspacesOpened ['first']` and
      the stages `workspace, changes, records`. The whole first run by hand is still open below.*
- [x] Primary buttons on the walk carry their verb glyph (connect, continue with the RTL mirror
      class, create); the name and password fields carry muted leading glyphs.
      *Verified: the same run: `svg` inside the connect, continue and both create buttons, the
      continue arrow's class containing `rtl:rotate-180`, and `[data-slot=input-group-addon] svg`
      before the name, password and workspace inputs with the addon carrying
      `text-muted-foreground`.*
- [x] `setup.doneTitle`, `setup.doneDescription`, `setup.linkLabel` and `setup.notYetSent` are
      removed from both locales; `setup.copyLink` and `setup.linkCopied` stay.
      *Verified: `grep -n 'doneTitle\|doneDescription\|notYetSent'
      apps/desktop/src/lib/i18n/{en,ar}/index.ts` printed nothing and `copyLink`, `linkCopied`
      remain; `setup.linkLabel` is kept, because `invite-form.svelte` reads it (since #820) and
      dropping a string its reader still needs would break the invite panel; ticket 07 renames or
      drops it with that reader.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; the Arabic strings are written, not copied.
      *Verified: on the stack's tip on 2026-09-12: `pnpm check` in `apps/desktop` printed `9277
      FILES 0 ERRORS 0 WARNINGS` and in `packages/design` `2807 FILES 0 ERRORS 0 WARNINGS`, `npx
      prettier --check .` printed `All matched files use Prettier code style!`, `npx eslint .`
      exited 0, `npx turbo run test --force` printed `Tasks: 4 successful, 4 total` (desktop
      node:test 901 pass, vitest 78 passed). The Arabic strings were written against the
      neighbouring strings' tone (`الخطوة {step} من {total}` with Arabic-Indic digits through the
      number formatter). The root `pnpm check` wrapper cannot start in this worktree (pnpm 12.4.1
      task-state path over Windows' limit), so its pieces were run one by one.*

## Relevant areas

`apps/desktop/src/lib/organization/setup.ts`, `organization/component/setup-walk.svelte`,
`routes/organization/new/+page.svelte`, `organization/tests/{setup,setup-walk.svelte}.test.ts`,
`layout/tests/startup.test.ts`, `i18n/{en,ar}/index.ts` under `organization.setup`.
`layout/component/startup-error.svelte` is the model for a `corner` snippet holding
`SurfaceAction`; `packages/design/src/lib/block/back-control.svelte` for the mirrored arrow.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]]**, *The connect step is a list*, *Back is SurfaceAction in the corner slot*, and the
  last technical risk on the third step and `standingChanged`.
- **The look is settled on screen, on the human's own account.** The connect list's glyphs and
  the position line are prototyped in the running application and judged there; ask before
  driving the app (the human is at the machine).
- **Cite the reference where it decides something**: *Supercharge the defaults* (p.220) on the
  list; *Balance weight and contrast* (p.56) on the field glyph.
- **The walk stays on `StandaloneSurface`, tone neutral** ([[rules/interface]], *Application
  surfaces*).
- **819's criterion 3 keeps its meaning**: the vocabulary guard in `setup.test.ts` is what holds
  it, and a workspace name is a person's own word, not a Turso detail. Say so in the test.
- **A changeset rides with the change.**

## Notes

One ticket rather than four because `setup.ts`, the component, the route, the strings and both
tests move together, and a walk half-moved is unusable.

Landed 2026-09-12 with two boxes open for the human at the machine: back during a pending consent, and the whole first run. Raised, not taken: the wall's password glyph is `key-round` and the join screen's is `lock` (07's sweep picks one); on a true first run the state query has no cache, so a machine holding authority shows the connect button for a tick before flipping to granted, and `startup.snapshot.organization.holdsTursoAuthority` would avoid it; `useDisconnect` now invalidates the organization state, as `useReconnectAuthority` already did, or a walk opened granted would keep reading the authority as held after it was given back.

**Review, 2026-09-13.** Two findings landed here. The third step's back is gone (above). And the
organization state query, which the walk reads for `holdsTursoAuthority`, is invalidated the
moment the consent poll turns granted, so a person who connects, returns to the wall and comes
back opens the walk granted at once rather than after the query's own refetch; the review had
traced one round trip on which the connect button drew first. The second round moved that
invalidation from a `$effect` in the route into `useConsentResult`'s own `queryFn`, beside every
other invalidation of the state key. A consent finished after the person has already left the
walk reaches no poll, so that sub-case still costs the one round trip; recorded, accepted.

**Closed by the human on 2026-09-13** with the by-hand criterion above unwalked, to merge and rethink the whole experience; the box stays open because nobody checked it, and the status says the ticket is no longer being worked.
