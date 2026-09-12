---
status: open
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

- [ ] `SETUP_STEPS` is `connect`, `name`, `workspace`; `SetupField` gains `workspace`;
      `setup.test.ts` holds `fieldsPresented` to `name`, `password`, `workspace` and the
      vocabulary guard still finds no slug, group, token or url. The test that said the link is the
      last step is rewritten to say the workspace is.
- [ ] On `connect`, `name` and `workspace`, exactly one `getByRole('button', { name: back })`
      renders in the surface's corner and its click calls `onBack`; the outline back button is gone
      (`grep` in the gate). The route's `onBack` goes to `THE_WAY_IN` from `connect` and to the
      previous step otherwise.
- [ ] With a consent pending, back is enabled and pressing it reaches the wall; verified once on
      the human's account with the browser consent left open, and recorded under Notes.
- [ ] Every step renders the position line "step n of 3", muted, in both locales.
- [ ] The connect step renders three `li` each with an `svg`, the dashboard link inside the
      first, and no `p` outside the list; the three English items together are shorter than the
      three paragraphs they replace, pinned as a literal in `setup.test.ts`.
- [ ] With `holdsTursoAuthority: true` the connect step renders granted on first render with
      continue and disconnect, and `onConnect` is never called. The route passes
      `stateQuery.data?.holdsTursoAuthority`.
- [ ] The third step renders the shared workspace fields; on create, the route calls the workspace
      mutation, then `goto(THE_WAY_IN)` and `startup.standingChanged()` in the order the old
      done step's `next()` used; `startup.test.ts` holds that `standingChanged` after a create
      opens the one workspace and reaches `ready`. Verified once by hand for the whole first run.
- [ ] Primary buttons on the walk carry their verb glyph (connect, continue with the RTL mirror
      class, create); the name and password fields carry muted leading glyphs.
- [ ] `setup.doneTitle`, `setup.doneDescription`, `setup.linkLabel` and `setup.notYetSent` are
      removed from both locales; `setup.copyLink` and `setup.linkCopied` stay.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; the Arabic strings are written, not copied.

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
