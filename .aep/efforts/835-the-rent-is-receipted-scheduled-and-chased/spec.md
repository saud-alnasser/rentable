---
status: accepted
---

# Problem

The application records that rent arrived and works out what is owed, and stops there. The daily
work of collecting rent happens outside it.

- **A payment is a date and an amount** (`payment` in `platform/database/schema.ts`). How it was
  paid, the transfer or cheque number, and anything said about it have nowhere to go, so a payment
  cannot be matched against a bank statement or told apart from another of the same amount on the
  same day.
- **Nothing is handed to the tenant.** A landlord who receives rent owes the payer a receipt
  (سند قبض), and the application has no way to produce one; it is written by hand or in another
  program, from figures copied out of this one.
- **A contract's debt is one number.** The contract record states what is outstanding
  ([[contexts/desktop/contract]], *Outstanding*) but not which cycles it is made of: which were
  paid, which were paid in part, which are late, which come next. The cycle arithmetic exists
  (`countExpectedPayments` in `contract/contract.ts` counts a cycle as due on its first day) and
  is never shown cycle by cycle, and a tenant asking "what do I still owe, and for when?" gets an
  answer the landlord has to work out on paper.
- **The application waits to be asked.** The landing screen ranks what is already overdue, owing,
  or ending soon (`CONTRACT_RANKS` in `contract/rank.ts`). A cycle falling due in three days is on
  none of them until the day it is due, and chasing it means leaving the application to write a
  message by hand to a number copied from the tenant's record.

The cost: every collection is finished in some other program, the figures in that program drift
from the ones here, and the landlord does the arithmetic the application already knows.

*Deferred before, not declined.* [[efforts/work-the-surfaces-cannot-do/spec]] put desktop
reminders, notes and printing out of scope because the schema held no free-text column and a
server and browser client were expected to change their meaning. No server is coming: the
organization lives on the customer's own Turso account and everything runs in the desktop
application ([[contexts/desktop/organization]]). The premise of the deferral is gone, and this
effort adds the columns it was waiting for.

# Goal

Collecting rent is done inside the application, from recording the payment to handing over the
receipt to chasing the next one:

- a payment says how it was paid, with a reference and a note;
- every payment produces a receipt the landlord can print or save and hand to the tenant, in
  Arabic and English;
- every contract shows its schedule, cycle by cycle, and the schedule can be printed;
- what falls due in the coming week is on the landing screen, and the tenant can be reminded on
  WhatsApp in one act, with the message already written.

# Scope

The payment record and its form, the contract record, the landing screen, and a new printed
surface for a receipt and a schedule, in `apps/desktop/src`. One schema change: three optional
columns on `payment`, with their migration. The rank vocabulary gains one rank. The interface rule
on notifying ([[rules/interface]], *Notifying is these two and nothing else*) is kept, not revised.

# Requirements

## Payment details

1. **A payment records how it was paid**: one of cash, bank transfer, cheque, or Ejar (paid
   through the Ejar platform's SADAD bill). Optional. A payment recorded before this effort, or
   recorded without it, reads as *not recorded* rather than as any one method.
2. **A payment carries a reference and a note.** The reference is a short line (a transfer, cheque
   or SADAD number); the note is free text. Both optional, both set on the payment form, both
   shown on the payment's record.
3. **The reference is searchable.** Typing a payment's reference into the payments search finds it.
4. **A payment keeps a history, and the new fields are part of it.** Recording, editing and
   deleting a single payment each write an entry, as deleting several already does
   (`useDeleteManyPayments` is the only payment write that records one today), and a payment's
   record shows its history as a contract's does. An edit to the new fields is undone by undo,
   exactly as an edit to the date or amount is ([[rules/data]], *Undo*).

   *Decided by the human on 2026-09-25, at the plan:* the draft said an edit is "recorded in
   history, exactly as an edit to the date or amount is"; reading the code showed neither is, and
   the human chose to record payment history rather than drop the clause.

## Schedule

5. **A contract's record shows its schedule**: one row per cycle across the whole period, each
   with its due date, the amount due for it, the amount covered, and its state.
6. **Payments cover cycles oldest first.** Every payment against the contract, taken in date
   order, fills the earliest cycle not yet covered before the next. A cycle is:
   - **paid** when it is covered in full;
   - **late** when its due date is before today and it is not covered in full, stating the part
     covered where there is one;
   - **due** when its due date is today and it is not covered in full;
   - **partly paid** when its due date is after today and part of it is covered;
   - **upcoming** when its due date is after today and nothing covers it.

   A terminated contract's schedule shows no cycle as late or due: termination makes the debt a
   closed matter ([[contexts/desktop/contract]], *Owing*).
7. **The schedule can be printed**, carrying the contract, its tenant, its units, and every row,
   with headings in Arabic and English.

## Receipt

8. **Every payment has a receipt**, reached wherever a payment's acts are offered: its record,
   its card in a contract's ledger, and the palette.

   *Decided by the human on 2026-09-25, at the plan:* the draft also offered it in the confirmation
   after recording; that confirmation carries one offer, undo, and the human chose to keep it so.
9. **A receipt states**, on one page, in Arabic and in English:
   - that it is a receipt (سند قبض), and a reference that identifies this payment and no other;
   - who issued it: the workspace the payment was recorded in;
   - the date received and the amount, in riyals;
   - who paid: the tenant's name and national identity number;
   - how it was paid, and its reference, where recorded;
   - what it was for: the contract (with its Ejar number where recorded), its units and their
     complex, and the cycles this payment covers, by the order of requirement 6;
   - what remains of the contract's total cost after this payment, counting the payments the
     allocation takes before it and this one.
10. **A receipt can be printed, and saved as a PDF, through the system's print dialog** on every
    platform the application ships on. The dialog is the one path that works on all three
    ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/evidence/research/printing-a-page-from-the-webview]]);
    its PDF destination is how a PDF is saved. The printed page is the receipt alone, never the
    application around it.

## Reminders

11. **The landing screen shows what falls due in the next seven days**: a contract whose next
    cycle's due date is within the next seven days and which that cycle is not already covered
    in full. It is a rank, *due soon*, read after *owing* and before *ending soon*, and a contract
    in a money rank stays in that rank, as a contract is in one rank only today.
12. **A tenant can be reminded on WhatsApp in one act**, on a contract in *overdue*, *owing* or
    *due soon*, wherever a contract's acts are offered: the landing screen, the contract's record,
    the contracts directory, and the palette ([[rules/interface]], *Record card actions*: an act
    offered on one of them is offered on all). The act opens WhatsApp
    addressed to the tenant's phone, with a message already written that names the tenant, the
    amount, the date it is or was due, and the units, in the language the application is showing.
    The landlord reads it and sends it; the application sends nothing.

# Acceptance Criteria

1. (a) The payment form offers the four methods and leaves none chosen by default. (b) A payment
   saved with a method shows it on its record. (c) A payment written before the migration opens,
   edits and saves, and its record says the method is not recorded.
2. (a) A reference and a note saved on the form are shown on the payment's record and survive a
   restart. (b) A payment saved with neither shows neither, and no empty label stands in for them.
3. A payment whose reference is `SADAD-7731` is found by searching `7731` in the payments search,
   in both locales.
4. (a) Editing a payment's method, reference or note and pressing undo restores the old values.
   (b) Recording a payment, editing it, and undoing the edit each add an entry, and the payment's
   record lists them, newest first. (c) Deleting a single payment writes an entry, as deleting
   several does.
5. A twelve-month contract on a quarterly interval shows four rows, due on the start date and on
   the first day of each following quarter, each due the contract's cost.
6. (a) On any contract that is not terminated, the sum of what is not covered across every late
   and due cycle equals the contract's outstanding as the record already states it. (b) A contract
   of four quarterly cycles, each 3,000, with payments of 3,000 and 1,000 and today inside the
   second cycle, shows paid, late with 1,000 covered, upcoming, upcoming; with today before the
   second cycle's due date it shows paid, partly paid, upcoming, upcoming. (c) A terminated
   contract shows no late and no due row. (d) The allocation is computed on read and nothing it
   produces is stored.
7. Printing the schedule from a contract's record produces a page carrying every row of
   criterion 5's contract, with Arabic and English headings, in both appearances of the
   application.
8. The receipt act is offered on every payment's record, on its ledger card, and in the palette,
   and is not refused on a terminated contract's payments (a receipt changes nothing).
9. (a) A receipt carries every item of requirement 9, and omits method and reference, not their
   labels only, where they are not recorded. (b) Two different payments never produce the same
   receipt reference. (c) The Arabic reads right to left and the English left to right on the same
   page. (d) A payment covering the second cycle and part of the third names both.
10. (a) On Windows, macOS and Linux builds, the print act opens the system print dialog; on macOS
    this is the case that fails today, because the application does not hold the webview's print
    permission. (b) Choosing the dialog's PDF destination saves a PDF whose Arabic is shaped,
    reads right to left, and is selectable. (c) The page carries no sidebar, titlebar, or address
    of the application's own page.
11. (a) A contract whose next cycle is due in three days and is not covered is under *due soon*.
    (b) The same contract with that cycle prepaid is not. (c) A contract that owes today and has a
    cycle due in three days is under *owing* only. (d) Nothing is under *due soon* for a cycle due
    in eight days.
12. (a) The act opens `https://wa.me/<number>?text=<message>`, where the number is the tenant's
    phone without its `+`, and the message is URL-encoded. (b) The message names the tenant, the
    amount, the date and the units, in Arabic when the application shows Arabic and in English
    when it shows English. (c) The act is not offered on a contract in no rank or on a terminated
    one.

# Constraints

- **No system notification.** [[rules/interface]] settles that the application notifies through a
  toast or a callout and nothing else (effort 832, requirement 12). The digest is the landing
  screen, which is what the application opens on. Revising the rule would be a separate decision.
- **The status model is not reopened.** Allocation (requirement 6) is a reading of payments
  against cycles for display. It changes no contract status, no outstanding figure, no rank
  outside *due soon*, and no refusal; a schedule that disagreed with the outstanding figure would
  be a second answer to the question [[contexts/desktop/contract]] already answers.
- **Whole days, UTC**, as every date in the contract domain is. A cycle's due date and "today" are
  UTC days.
- **Western digits in both locales**, as effort 832 decided; that includes the receipt and the
  schedule.
- **Offline first.** The schedule, the receipt and the printed pages work with no network. Only
  opening WhatsApp needs one, and it is the landlord's WhatsApp that does.
- **A migration reaches a workspace through the Rust wire runner**, generated from the schema and
  hand-finished ([[contexts/desktop/persistence]]). The three columns are nullable, so no row
  written before them needs a value.
- **The new text columns can hold Arabic.** They are not ASCII-only and are not added to
  `ASCII_ONLY_COLUMNS`.
- **The new acts follow workspace permissions.** Setting the new fields is part of recording or
  editing a payment and needs what that needs; reading a receipt or a schedule needs only what
  reading the payment or contract needs.

# Out of Scope

- **System notifications, and anything running while the application is closed.** See
  *Constraints*.
- **Sending a message.** No WhatsApp Business API, SMS or email; the application opens WhatsApp
  and the landlord sends. Whether a reminder was sent is not recorded.
- **Sequential receipt numbers.** A gap-free sequence cannot be issued safely by several machines
  recording offline against replicas; the receipt reference identifies the payment instead.
- **A tax invoice.** A receipt is not a ZATCA e-invoice, carries no VAT, and says nothing that
  claims to be one.
- **The amount in words** (تفقيط) and **Hijri dates** on the receipt. The ledger pins the Gregorian
  calendar (`PAYMENT_LEDGER_MONTH_FORMAT`), and a second calendar is its own decision.
- **Choosing which cycle a payment pays.** Allocation is always oldest first.
- **Late fees, grace periods, and partial-cycle proration.**
- **A logo or letterhead** on the receipt, and printing several receipts at once.
- **Freezing a receipt.** A receipt is produced from the payment as it stands; editing the payment
  and printing again gives the edited receipt.
- **Attachments** (a scan of the cheque or the transfer).
- **Offering the receipt in the confirmation after recording.** It carries undo alone
  ([[rules/interface]], *Undo*).
- **A contract's history listing its payments' entries.** A payment's entries are read on the
  payment's record; a deleted payment's entries are recorded and have no record to be read on,
  as is already true of a bulk deletion.
- **Writing a PDF without the print dialog.** Possible on Windows and macOS only through native
  webview code, and not dependable on Linux (WebKit bug 212814), so it would be a platform-shaped
  feature; the dialog's PDF destination serves all three.
- **A PDF produced in JavaScript.** No library found shapes Arabic (pdf-lib, jsPDF, pdfmake), so a
  receipt built that way would be unreadable in the language it is for.

# Assumptions

- **The issuer named on a receipt is the workspace**, by the name the shell shows for it
  ([[efforts/the-shell-says-whose-workspace-this-is/spec]]). A landlord who wants a person's or a
  company's name on it names the workspace that way.
- **Seven days is the right window for *due soon*,** fixed rather than a setting. *Ending soon*
  has a setting because notice periods vary by contract; rent reminders do not.
- **A payment is taken in date order for allocation, and payments on the same day by the order
  they were recorded.**
- **`wa.me` opens the WhatsApp desktop application where it is installed and WhatsApp Web where it
  is not**, through the opener plugin the application already carries.

# Risks

- **Float dust in the allocation.** Amounts are floats; a cycle covered to within a halala must
  read as paid, or criterion 6(a) fails on rounding. The contract domain already tolerates this
  with `EPSILON`, and the allocation has to use the same tolerance.
- **A receipt reference taken from a short prefix of the payment id could collide** as a
  workspace grows. Criterion 9(b) is what catches it.
- **Arabic on a printed page.** If the print path does not shape Arabic, or reverses mixed
  Arabic and digits, the receipt is unreadable to the person it is for. Criterion 10 is judged on
  a printed or saved page, not on the screen.
- **The research is read from source, not run.** macOS's refusal without the print permission,
  WebView2 applying print styles, and two reported print bugs on macOS 26 are unconfirmed on a
  machine. The first build of a printed page is where they show, and criterion 10 is walked on
  each platform before the effort closes.
- **WebView2 may print its own header and footer** carrying `https://tauri.localhost/` unless
  they are switched off in the dialog; criterion 10(c) catches it.
