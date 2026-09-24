---
status: open
blocked-by: [10, 11]
---

# feat(desktop): an ordinary delete offers undo, and a confirmation names its act

## Outcome

Deleting a record that takes nothing else with it happens at once and offers undo. A confirmation
appears only for a delete that removes more than the record, or that cannot be undone, and its
button names the verb. Acts that are not deletes (terminate, restore, sign out elsewhere, and the
other organization confirmations) use a confirm dialog titled and labelled with their own verb.

## Acceptance Criteria

Traces requirements 6 and 11 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 11.

- [ ] `RecordAct` gains a confirmation policy (`none | cascade | irreversible`), declared per act.
      The hosts open the delete dialog only when the policy asks.
- [ ] `packages/design/src/lib/block/confirm-dialog.svelte` is added. Terminate, restore,
      end-other-sessions, forget account and disconnect move to it. `delete-dialog.svelte` keeps the
      cascading deletes and the organization.
- [ ] Router and component tests. Deleting a tenant with no contracts, a unit, a payment, or a
      contract with no payments opens no dialog, and the toast offers undo that restores it. Deleting
      a complex with contracts asks. Terminate uses the confirm dialog.
- [ ] The delete dialog's own line "you can undo this while the app is open" goes where no dialog
      is shown any more.
- [ ] `[[rules/interface]]` gains a *Delete and confirm* section.

## Relevant areas

- `packages/design/src/lib/block/delete-dialog.svelte`, `packages/design/src/lib/confirmation.ts`,
  `apps/desktop/src/lib/design/mutation.ts` (the undo offer)
- the hosts from tickets 09 to 11, `organization/component/disconnect-dialog.svelte`, and others
  reusing the delete dialog (grep)

## Constraints

- Undo lasts for the session, as today. The spec's *Risks* accepts that.
- A blocked delete (a tenant with contracts) is still refused with its blockers, not deleted.
