# Problem

A read-only review of the whole application on 2026-10-09 found six places where rentable shows
the reader something that is not true, or takes away something they cannot get back. The full
review is kept outside the repository; these six are the ones the human chose to fix first.

- **A failed read looks like an empty set or a missing record.** The query client retries
  nothing and handles no error globally (`startup/component/root.svelte`, `retry: false`). The
  list shell picks its empty state from `rows.length` alone (`list/component/list.svelte`,
  `hasResults`), so when the tenants read fails the reader is told *no tenants yet* and offered
  a create button. The record surface takes only `isLoading` and `found`
  (`packages/design/src/lib/block/record-surface.svelte`), and its six callers pass
  `found={Boolean(record)}`, so a record whose read failed is drawn as *not found*. The workspace
  page (`organization/workspace/component/page.svelte`) does the same. [[rules/interface]], under
  *Error*, says what failed says so and that what is not there is not a failure; these surfaces
  say the opposite.
- **The landing screen reads as "everyone has paid" while it loads, and forever after a failed
  read.** The figure band sits outside the loading block and falls back to `?? 0` for collected,
  due, occupancy and outstanding (`dashboard/component/landing.svelte`), next to the *nothing to
  chase* empty state.
- **An error toast is gone before it can be read.** The toaster is mounted with
  `duration={1500}` (`notification/component/provider.svelte`) and `notify.error`,
  `showErrorSentence` and the mutation handlers raise errors with no override. A refusal toast is
  the only channel [[rules/interface]] gives an act that failed. The toaster also stays at
  sonner's default bottom-right in Arabic, where every other surface mirrors.
- **A renewed contract keeps asking to be renewed.** A renewal records no link to the contract it
  continues (`contract/renewal/renewal.ts`: "Nothing here records lineage", deferred by
  [[efforts/work-the-surfaces-cannot-do/spec]]). `isContractEndingSoon` (`contract/rank/rank.ts`)
  therefore keeps the predecessor in the ending-soon rank until its end date passes, the landing
  screen keeps listing it as work, and *renew* is still offered on it. A renewal also cannot
  change the rent (`contract/renewal/router.ts`: "a renewal that could restate the cost would be
  an edit wearing another name"), so a renewal at a new rent, the common case, is entered as a
  new contract by hand, which no link could ever reach.
- **Labels on red are hard to read in dark mode.** The dark `--destructive`
  (`oklch(0.704 0.191 22.216)`, `packages/design/src/lib/tokens.css`) carries white labels at
  about 2.9:1: the destructive button, the field-error bubble, the destructive badge and the
  ending-soon bubble. `packages/design/src/lib/tests/tokens.test.ts` checks text on surfaces and
  never a label on a filled tone. Light mode is about 4.6:1.
- **A half-filled form is lost to a stray key or click.** `block/form-surface.svelte` closes on
  Escape, a click on the overlay or the close control, with no check for what was typed. The
  contract and tenant forms are long, and undo does not cover a draft.

What it costs: a reader can act on a false picture (create a tenant that exists, believe nothing
is owed, renew a contract twice) and is not told when something went wrong.

# Goal

What the application shows is true. A read that failed says it failed, a figure that is not known
is not drawn as zero, an error stays long enough to read, a renewed contract stops asking to be
renewed, every label on a coloured fill is readable in both appearances, and typed input is never
thrown away without the reader choosing to.

# Scope

- The list shell, the record surface and its callers, the workspace page, and the landing screen's
  figure band, for the failed and loading states.
- The toaster's duration for errors and its placement in either reading direction, and the
  [[rules/interface]] *Feedback* paragraph that fixes the duration.
- Contract renewal: recording which contract a renewal continues, recognising renewals made
  before this change, the ending-soon rank, the renew act, and the rent on the renew form.
- The design tokens a label on a filled tone uses, and the token test.
- The form surface's dismissal.

# Requirements

1. **A read that failed is drawn as a failure.** Every list drawn by the list shell, every record
   surface, and the workspace page, whose read fails, draws a failed state in the reader's
   language with a way to try the read again. It never draws *nothing here yet*, a create
   offer, or *not found* for a failed read. A record whose read succeeded and returned nothing is
   still *not found*.
2. **The landing screen never states a figure it does not know.** While the figures are loading
   the band draws the loading treatment, and if their read fails the band says it failed, with a
   way to try again. Neither state draws a zero, and *nothing to chase* is drawn only when the
   ranks' read succeeded and holds no section.
3. **An error toast stays until the reader is done with it.** An error toast, raised by any path
   (`notify.error`, `showErrorToast`, `showErrorSentence`, the mutation handlers), stays until the
   reader dismisses it, and carries a control to dismiss it. Success and warning toasts keep their
   short shared duration, and one carrying an offer keeps its longer one (*Undo*).
4. **The toaster mirrors with the reading direction.** Toasts stand at the bottom end of the
   window: bottom-right in English, bottom-left in Arabic.
5. **A renewal records the contract it continues.** A contract created by renewal stores which
   contract it renews. The link survives undo and redo of the renewal, a workspace export and
   import, and replication. A duplicate does not carry it.
6. **Contracts renewed before this change are recognised.** On the first open by a build carrying
   this change, a contract is taken as renewed by another when both name the same tenant, the
   other starts on the day after it ends, the two hold the same set of units, and the other is not
   terminated. Where more than one contract would qualify, none is taken (see *Risks*).
7. **A renewed contract is not up for renewal.** A contract with a successor that is not
   terminated does not rank as ending soon anywhere the rank is read (the landing screen, the
   contracts directory's rank filter, the command menu), and *renew* is not offered on it. If the
   successor is deleted, or terminated, the predecessor is up for renewal again.
8. **A renewal may change the rent.** The renew form shows the rent, filled with the
   predecessor's, and the reader may change it. The successor carries the rent entered; the
   predecessor is not written. The interval, tenant and units are still the predecessor's. The
   comment in `contract/renewal/router.ts` that rules this out is corrected.
9. **Every label on a filled tone is readable in both appearances.** Text drawn on a filled
   destructive, primary, success, warning, info or permitted colour meets WCAG AA (4.5:1) in light
   and dark, and the token test fails when one does not.
10. **A form with changes asks before it is closed.** Closing a form on the form surface by
    Escape, a click on the overlay, the close control or its cancel button, after the reader has
    changed something in it, asks whether to discard the changes or keep editing. Keep editing is
    the default and returns focus to the form. A form with no changes closes at once, and a
    submit never asks.

# Acceptance Criteria

- [ ] 1. With the tenants, complexes or contracts read made to fail, each directory draws the failed
      state with *try again*, no create offer and no *no ... yet* title; *try again* re-runs the read.
      With a record read made to fail, each of the six record surfaces and the workspace page draws
      the failed state and not *not found*; a record id that does not exist still draws *not found*.
      Component tests cover the list shell and the record surface in all three cases.
- [ ] 2. With the dashboard read held pending, the figure band draws the loading treatment and no `0`;
      with it made to fail, the band draws the failed state with *try again* and the empty state is
      not drawn. A component test covers both.
- [ ] 3. An error toast raised through each path is still on screen after ten seconds, closes from its
      dismiss control, and a success toast still leaves in the shared duration. The *Feedback*
      paragraph of [[rules/interface]] states the new rule.
- [ ] 4. In Arabic the toaster stands at the bottom left, in English at the bottom right, checked in the
      running application in both.
- [ ] 5. A renewal's successor stores the predecessor's id; undoing the renewal and redoing it restores
      the same link; a workspace exported and imported keeps it; a duplicated contract has none.
      Router tests cover each.
- [ ] 6. Opening a workspace seeded with a renewal made before this change (same tenant, next-day start,
      same units) shows the predecessor out of ending soon. A seeded pair that differs in tenant,
      units or start date is not linked, and an ambiguous seed links nothing. Tests cover each.
- [ ] 7. A renewed contract inside its notice window appears in no ending-soon list and offers no
      *renew*; deleting or terminating its successor puts it back in both. Rank and act tests cover
      it.
- [ ] 8. Renewing at a different rent creates a successor with that rent and leaves the predecessor's
      rent, payments and status unchanged; renewing without touching the rent keeps the old one.
- [ ] 9. `packages/design/src/lib/tests/tokens.test.ts` checks every label-on-fill pairing in both
      appearances at 4.5:1 and passes; the four surfaces named in *Problem* read at 4.5:1 or more in
      dark mode.
- [ ] 10. For the contract, tenant and payment forms, and one organization form: changing a field then
       pressing Escape, clicking the overlay, the close control and cancel each ask first; *keep
       editing* leaves the values in place; *discard* closes; an untouched form closes at once; a
       submit closes without asking. Component tests cover the form surface.

# Constraints

- **The application has users** ([[contexts/repository]], *Constraints*). Recording the link and
  recognising earlier renewals change data at rest, so they follow [[rules/migrations]]: the step
  is declared in `apps/desktop/tauri/src/database/step.rs` with its kind and floors, the database
  of the version before it is seeded in the tests, and no organization is reset to land it.
- **Reconciliation owns derived state** ([[contexts/repository]], *Boundaries*). Whether a contract
  is renewed is read from the link, not stored as a status: contract status stays the derivation
  [[contexts/desktop/contract]] defines.
- **Arabic and English, light and dark are first-class.** Every new state and sentence has both
  locales, mirrors, and reads in both appearances.
- **One way per act, and HIG first.** The failed state is one shared treatment across lists,
  records and the dashboard, built from the existing blocks
  ([[contexts/desktop/components]]); the discard question follows Apple's guidance to confirm
  before dismissing a sheet with unsaved changes.
- **A rule this changes is changed in the same effort.** The *Feedback* paragraph of
  [[rules/interface]] (toast duration) and any other rule text the change contradicts are amended
  where they stand.

# Out of Scope

- The rest of the 2026-10-09 review: the interface consistency items (dialog descriptions, the two
  form validation styles, page titles and headings, unit-pane loading, casing, spacing, status
  icon tab stops), every product item (reports, instalment plans, post-dated cheques, expenses,
  deposits, chasing, receipts, attachments, history authorship, restore, VAT), and every
  engineering item (live Turso tests in CI, reconcile batching, indexes, CI on Windows and
  macOS, unit assignment atomicity, log redaction, test speed).
- **Recording "will not renew" or "vacating".** A contract that will not be renewed stays in
  ending soon until it ends, as today.
- **Changing the interval, tenant or units at renewal.** Only the rent becomes editable.
- **Showing the link on a contract's page** (*renewed by*, *renews*) beyond what requirement 7
  needs. It may follow once the link exists.
- **Retrying reads automatically.** A failed read is offered to the reader to retry; the query
  client's `retry: false` stays.
- **Keeping drafts across a close.** A form asks before discarding; it does not save a draft.

# Assumptions

- *try again* re-runs the failed read in place and needs no new procedure.
- An error toast that stays does not pile up without bound in practice; the toaster's own stacking
  is enough. If it is not, the plan caps how many stand at once.
- The dark destructive fill can reach 4.5:1 for its label without failing the 4.5:1 the same token
  needs as text on the surfaces, by a separate fill or label token. The plan decides which.
- Recognising earlier renewals at first open, rather than at every read, is the cheaper shape; the
  plan decides between a one-off step and a read-time rule.
- The renew form's rent field is the contract form's existing cost field, enabled for renewal.

# Risks

- **A wrong link hides a contract that needs renewing.** Requirement 6 matches on tenant, next-day
  start and the same units; a hand-made next contract that matches but was not meant as a renewal
  is taken as one. Harmless, since it does continue the term, but it is a guess written into data.
  Contracts holding no units match on tenant and date alone, which is weaker, and an ambiguous
  match links nothing.
- **An older build on the same workspace.** A build without this change renews without writing
  the link and drops it if it restores a successor from its own undo. The predecessor then
  reappears in ending soon. The migration's kind and floors are where this is judged.
- **The discard question fires where it should not.** A form that seeds values on open (the
  renew form, a duplicate) must count only the reader's changes, or every such form asks on close.

---

Effort: `.aep/efforts/861-the-app-never-shows-something-false/`
