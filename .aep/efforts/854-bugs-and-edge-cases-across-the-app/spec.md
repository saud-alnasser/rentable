---
status: draft
---

# Problem

The human asked on 2026-10-06 for the app to be checked for bugs and edge cases across the
board, and for every one found to be fixed in a single effort. Four hunters swept the Rust
shell, the frontend data layer, the domain rules and the interface at c9d9c4ba, right after
effort 851 merged. Each finding was traced through the code end to end, several were
reproduced, and the orchestrator re-read the headline ones. The findings, with file and line,
are in [[efforts/854-bugs-and-edge-cases-across-the-app/evidence/research/app-wide-bug-hunt]].

What they cost, worst first:

- **Undo crosses workspaces.** The undo stack is never cleared, so Ctrl+Z after a workspace
  switch or a sign-out writes the last workspace's records into the new one, and they sync to
  Turso. Two hunters found it independently.
- **A record page can show the wrong record.** Renewing a contract, or jumping between two
  records of one kind from the palette, changes the address but keeps showing the first record,
  and the reader can then act on it.
- **Paid contracts read as overdue.** Money is compared with no tolerance in the ranking, so a
  contract paid in full can rank overdue with nothing outstanding and offer a reminder the app
  then refuses.
- **Imports break the data's own rules.** Contract import can double-book a unit, tenant import
  plans as clean and then fails whole on a duplicate national id or phone, and payments can land
  on an arbitrary contract when two numberless contracts share a reference.
- **A network stall can hang the whole app.** Replica push and pull have no timeout and hold
  the database lock, so a silent network leaves launch on the loading screen, or blocks every
  query.
- **A truncated settings or sync file stops the app from ever starting**, and nothing tells the
  person why.
- **The owner's Turso consent can fail on Windows** when the browser opens a connection before
  sending its request.
- And smaller ones: undo that "succeeds" against a record deleted elsewhere, redo that records
  deletions it did not make, silent sign-in failures, cleared form input, shortcuts firing
  behind dialogs, lost update progress, Arabic-Indic digits erased or refused, misleading
  credential errors, and missing history entries.

**Money cannot go back to a tenant.** Asked about the landing page's figures, the human ruled
that money is recorded as it moved, nothing implicit, and added: there should be a way, without
deleting a payment, to return money from the organization to the tenant from the payments page,
so payments go both ways. The case is a contract terminated after rent was paid ahead, or any
other contract where money is owed back. Today a payment is only money received, a terminated
contract locks every payment change, and `payment/payment.ts` says a negative amount "is a refund,
which this application does not have a concept for". The human folded it into this effort.

# Goal

Every defect in the evidence is fixed, each pinned by a test that fails before the fix and
passes after it, wherever the repository's test rules allow one. The app behaves the same as
before everywhere else.

# Scope

The desktop app, both sides of the IPC boundary, and `packages/design` where a shortcut is
matched. The defects named below, and one feature the human folded in: recording money returned
to a tenant (requirement 25). No other feature, no redesign.

# Requirements

## Undo and history

1. Nothing recorded in one workspace or session can be undone or redone in another. Switching
   workspace, signing out, raising the sign-in wall, and selecting or removing an organization
   empty the undo and redo stacks and withdraw any open undo offer.
Requirements are numbered by the evidence's ids, so they are grouped by area rather than in
order.

8. An undo or redo whose record no longer exists fails visibly with a refusal. It writes no
   history entry, does not move to the other stack, and never recreates the record. This holds
   for units, contracts, renewals, payments and complexes, as it already does for tenants.
9. Redo of a bulk deletion of tenants, units, payments or contracts remembers only what it
   actually deleted, so the next undo restores exactly those, as the complex deletion already
   does.
23. Renewing a contract and changing a contract's units each write their history entry
    (`renewed`, `assigned`), the same as every other write.
24. Undoing the creation of a complex asks for the unit-deletion permission only when the
    complex has units.
12. The undo and redo keys do nothing while a form, sheet or confirmation is open over the page.
    The command palette does not count as covering.

## Interface

2. Every record page follows its address. Moving from one record to another of the same kind,
   by renewal, the palette, a link or the back button, shows the record the address names.
10. A failure to open the workspace after signing in, or after first-run or no-workspace setup,
    reaches the reader as the error screen, the same as a failure at launch. The wall is never
    left silent or loading forever.
11. Creating a workspace from the dialog or the no-workspace screen keeps the typed name when
    the create fails.
13. Leaving the general settings tab while an update downloads does not cancel or forget it,
    and the restart button cannot be pressed twice while a restart is in flight.
14. A keyboard shortcut answers to the character the layout produces. On a layout where Ctrl+Y
    or Ctrl+W produces a Latin letter, it runs that letter's action and never undo. Matching on
    the physical key stays as the fallback for layouts that produce no Latin letter, such as
    Arabic.
21. Phone, national id, payment amount and contract cost accept Arabic-Indic digits, the same
    as search already does. They are read as the Western digits they stand for, and never
    erased or refused as malformed.

## Domain rules

3. A contract's rank compares money with the tolerance the rest of the domain uses. A contract
   paid in full never ranks owing or overdue, never shows in the directory's owing or overdue
   filter, and is never offered a reminder.
4. Restoring a terminated contract, one or several, is refused when another live contract now
   holds one of its units over intersecting dates, and the refusal names the conflict. The undo
   of a deletion (`contract.restoreMany`) keeps its documented behaviour.

## Transfer

5. Importing contracts never double-books a unit. A row naming a unit twice, two rows taking one
   unit over intersecting terms, or a row taking a unit an existing contract holds are refused
   in the plan, naming the row, and the write refuses them too.
6. Importing tenants treats national id and phone as unique each on its own, as the schema does.
   A row holding either value already held, or two rows of one file sharing either value, are
   named in the plan. The write never fails with a raw constraint error.
7. A payment row never lands on an arbitrary contract. A contract reference that more than one
   contract answers to is never resolved silently. A workspace holding two numberless contracts
   for one tenant that start the same day exports and imports into an empty workspace whole,
   with each payment on its own contract.

## Money returned to the tenant

25. A member who may record payments can record money returned from the organization to a
    tenant against any contract, a terminated one included, from the contract's payments,
    without deleting any payment. It carries an amount, a date, and the same optional method,
    reference and note a payment does. It shows in the ledger as money going out, distinct from
    money received, and can be undone and deleted like a payment. Ordinary payments on a
    terminated contract stay locked. How it bears on what is paid and owed, any limit on its
    amount, and how the landing page shows it wait on the open questions below.

## Rust shell

15. Every replica push and pull is bounded in time. A pull, push or replication that does not
    answer within the bound is treated as offline. No network call holds the database lock in a
    way that stalls queries or launch past that bound.
16. The Turso consent callback survives a connection that opens and sends nothing, or sends its
    request in pieces. It keeps listening until the real callback arrives or the consent times
    out.
17. A settings, sync or update record that cannot be read never stops the app from starting.
    The unreadable file is set aside rather than deleted, and the app starts from the last good
    copy where one exists, or from defaults where none does, and logs what happened. Writes reach
    the disk before the rename that commits them.
18. A failed update download can be retried in the same session. An update recovery record
    whose target is not the running version, after a restart, no longer blocks later updates.
19. When the credential store cannot answer, a Turso act reports that, not "not connected".
    "Not connected" is reserved for a consent that was never granted or is gone.
20. The consent callback checks the consent's `state` before acting on anything else in the
    request, including `error`, and everything it echoes into its page is HTML-escaped.

# Acceptance Criteria

1. A test switches workspace, signs out, raises the wall, and selects and removes an
   organization, each after recording an inverse. After each, both stacks are empty and the undo
   offer is withdrawn.
2. A component or route test moves from one tenant, contract, complex, unit, payment and
   contract-units address to another of the same kind and sees the second record's data.
3. A unit test ranks a 12-month contract at 4166.67 with twelve payments of 4166.67 as not owing
   or overdue, and the directory's owing and overdue filters exclude it.
4. Restoring a terminated contract whose unit another live contract holds over intersecting
   dates is refused with a named conflict, singly and in a selection. A test pins
   `contract.restoreMany` unchanged.
5. Tests import a row naming one unit twice, two overlapping rows on one unit, and a row on a
   held unit. Each is refused in the plan naming its row and refused by the write, and no
   `contract_unit` row is written.
6. Tests import a held national id with a new phone, a held phone with a new id, and two rows
   sharing one value. Each is named in the plan, and no import ends in `UNIQUE constraint
   failed`.
7. A test exports a workspace with two numberless same-day contracts for one tenant, each with
   a payment, and imports it into an empty workspace. Both contracts and both payments arrive,
   each payment on its own contract. An ambiguous reference that cannot be resolved is refused,
   never resolved silently.
8. For units, contracts, renewals, payments and complexes, a test deletes the record outside the
   undo, then undoes its creation. The undo is refused, no history is written, and redo cannot
   recreate the record.
9. A test redoes a bulk deletion that is partly refused, then undoes it. Only the records the
   redo deleted come back, with no `idTaken`.
10. Tests make `hasWorkspace` throw after sign-in and after `standingChanged`, and see the error
    screen.
11. Tests fail a workspace create from both surfaces and find the name still in the field.
12. A test opens a dialog, presses Ctrl+Z and Ctrl+Y, and sees no inverse applied. With only the
    palette open, the keys behave as before.
13. A test unmounts the updates card mid-download, remounts it, and sees the download in
    progress. The restart control is disabled while its mutation is pending.
14. Tests: `key: 'y', code: 'KeyZ'` with Ctrl does not undo; `key: 'w', code: 'KeyZ'` does not
    undo; an Arabic layout's Ctrl+`code: 'KeyZ'` still undoes.
15. A Rust test with a pull, push and replication that never answer sees each return as offline
    within the bound, and another query runs while it waits.
16. A Rust test opens a silent connection, then a split request to the callback. The consent
    settles from the second and is not failed by the first.
17. A Rust test loads an empty, a truncated and a zero-filled record of each kind. The app state
    comes up from the last good copy or the defaults, and the bad file is kept beside it under a
    new name.
18. Rust tests: prepare after a failed download in the same session succeeds; bootstrap with a
    pending record whose target is not the running version clears it.
19. A Rust test with a credential store that fails (not absent) sees a credential error, not
    `TursoNotConnected`.
20. Rust tests: a callback with `error=` and a wrong `state` leaves the consent open; an `error`
    holding markup is escaped in the page.
21. Tests type or paste Arabic-Indic digits into phone, national id, amount and cost, and see
    them accepted as their Western values.
23. Tests renew a contract and change its units, and find `renewed` and `assigned` in its
    history.
25. Tests record money returned on an active and on a terminated contract, see it in the ledger
    as money going out, undo it and delete it, and find every existing payment untouched. The
    rest of this criterion is written when the open questions are answered.
24. A test undoes the creation of a complex with no units as a member without the unit-deletion
    permission, and the undo is not refused.

# Constraints

- **The app has users.** Nothing may reset an organization, a workspace or a setting, or make
  anyone set up again. A recovered record carries the held organizations over wherever a good
  copy exists. *Why: installs are in the field (memory of 2026-10-05, rules/migrations).*
- **The transfer file format stays readable.** Files exported before this effort import after
  it, and a reference that resolved uniquely before resolves the same way. *Why: people hold
  exported workbooks.*
- **`contract.restoreMany` keeps its documented behaviour**: the undo of a deletion brings its
  units back even where another contract has taken one since (`rules/data`, *Undo*).
- **Each fix is pinned by a test at the level `rules/testing` fixes**, written failing first
  where the behaviour allows it.
- **Schema changes go through `rules/migrations`**, additively, and existing payments read as
  money received with no change to any figure. Requirement 25 needs one; no other requirement
  may add one unless the plan shows it is the only way.
- **Collected stays money received as recorded.** The human ruled on 2026-10-06 that a payment
  on a contract terminated since still counts in the period it came in: "money must be recorded
  as is, nothing implicit".

# Out of Scope

- Storing money as integer minor units. Requirement 3 fixes the comparison. Changing the type is
  a migration of every amount, and its own effort.
- Carrying a payment's method, reference and note through transfer: effort 835 recorded it as
  noted and not changed.
- Rolling "today" over at local midnight rather than the UTC day: by design.
- The CSV reader's handling of multi-line cells: not reachable today.
- Making Turso able to revoke a single token, or changing the consent model.
- A new feature, layout or wording change beyond what a fix needs to say what went wrong.

# Assumptions

- The undo of a terminate (`unterminate` reached through undo) is refused like a direct restore
  when a unit has been taken since (requirement 4). Unlike a deletion's undo, it is not
  restoring rows; it is making a terminated contract live again.
- A bound of about 30 to 60 seconds for replica network calls matches what the platform API
  calls already use (30 s). The plan fixes the number.
- The six record routes are the only ones that read a route parameter once. The plan confirms
  this by search.

# Open Questions

Refunds (requirement 25) turn on three answers the human sent to research on 2026-10-06, written
to `evidence/research/money-back-to-the-tenant.md` (in progress):

- **Does money returned reduce what the contract counts as paid**, reopening what is owed, or is
  it recorded beside the payments? Should a refund be told apart from an expense or a fee?
- **Can a refund exceed what the contract has received**, and does the answer depend on the
  contract's state?
- **How does the landing page show money returned**: netted from collected, or beside it?

# Risks

- **A timeout that is too short** turns a slow but healthy pull into "offline" on a poor
  connection. It would show as a workspace that never catches up on a slow link.
- **Disambiguating contract references** must keep old files resolving the same way, or an
  import of an old workbook lands payments differently than before.
- **Money going out changes what "payment" means** in every place that sums payments: status,
  allocation, receipts, transfer, the directory's paid amount. One missed sum would show as a
  contract whose figures disagree between two screens.
- **Recovering a record from a backup copy** could bring back a held organization the person had
  just removed, if the removal was the write that was lost. It would show as an organization
  reappearing on the wall after a crash.
