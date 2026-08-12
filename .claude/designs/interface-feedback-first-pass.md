---
owner: repository
status: accepted
sources:
  - src/lib/design/block/delete-dialog.svelte
  - src/lib/design/block/record-actions.svelte
  - src/lib/design/mutation.ts
  - src/lib/layout/component/frame.svelte
  - src/lib/layout/component/undo-controls.svelte
  - src/lib/contract/component/units.svelte
  - src/lib/contract/component/unit-assignment-form.svelte
  - .claude/evidence/discussions/the-dashboard-after-the-queues-action.md
---

# fix(design): the interface overhaul's first pass of feedback

## Problem

The interface overhaul was used, and four things are wrong with it plus one that was
never settled.

**A confirmation dialog refuses work nothing blocks.** The shared confirmation dialog
withholds its confirming control while it does not yet know what blocks the operation.
That state is spelled as the absence of a value, and the value is optional — so a caller
that simply has nothing to say is indistinguishable from a caller that has not answered
yet. Four of the eight mounts say nothing, and all four are permanently unusable: a
contract cannot be terminated, a terminated contract cannot be restored, and a payment
cannot be deleted from either surface that offers it. A second latch sits beside it — a
refusal disables the control until the dialog is closed and reopened, so a failure that
could be retried cannot be.

**Duplicating a record mostly produces nothing worth having.** Duplicate is offered on
four record surfaces. On two of them every field that makes the record itself is cleared
first, because those fields are unique — so a duplicated tenant is a name, and a
duplicated complex is a location. Both are the create form with one field filled in,
wearing a label that promises more.

**Undo and redo are permanent chrome in the middle of the navigation.** They sit in the
titlebar between the search control and the window controls, so two global controls
interrupt a cluster that is otherwise about where the reader is.

**Assigning units is entered through a control that means something else.** The units tab
lists what a contract holds and offers the shared list shell's create affordance — a `+` —
which opens the assignment form. The affordance says *add a unit to this list*; the surface
it opens chooses the whole set at once, in both directions.

**The landing screen's shape was never decided.** It is recorded open, with three questions
outstanding, and this feedback lands on all three. It is out of scope here; see below.

## Goal

Every confirmation dialog offers its confirming control unless something is known to
block it. Duplicate appears only where the copy carries the record's substance. Undo has
no permanent chrome and stays reachable. A contract's units are transferred on the tab
that shows them, entered by being there.

## Constraints

- **Both locales.** Every surface below is bidirectional; a transfer that reads one way
  in Arabic and another in English is broken.
- **Reconciliation owns the derived columns.** Unit status and contract status are
  recomputed by the reconcile pass, so a per-transfer write pays a reconcile per
  transfer. The measured cost is bounded but not free.
- **A row opens its record and does nothing else** ([ADR 0025](../decisions/0025-a-row-opens-its-record-and-does-nothing-else.md)).
  The transfer panes are rows, so the transfer is an explicit control on the row and never
  the row itself.
- **Assignment's rules stay in the contract module and are the procedure's to enforce.** A
  terminated contract and a contract with a payment recorded both refuse; the surface says
  so and does not restate the threshold.

## Architecture

**The confirmation dialog's blocked state stops being spelled as an absence.** The three
answers a caller can give — *nothing blocks this*, *this is blocked, and here is what by*,
and *I do not know yet* — are three values, and the third is stated rather than inferred
from a missing prop. A caller with nothing to read says nothing and gets a working dialog;
a caller reading what blocks the deletion says so while it reads. The retry latch clears
when the reader changes anything or presses again, rather than surviving until the surface
is dismissed.

**Undo's affordance moves onto the announcement it already makes.** A declared mutation
carries both the message shown on success and the inverse recorded on the stack, and the
one function that binds a declaration sees both. So the toast that already says what
happened gains the control that takes it back, and the toast raised by an undo offers the
redo. Nothing is added to a declaration: a mutation that declares an inverse and a success
message gets the offer, and one that declares either alone is unchanged. The keyboard
shortcut keeps working and needs a home that is not a button, since the button is gone.

**The units tab becomes both panes.** What a contract holds and what it could hold sit
side by side on the tab, each pane a directory of unit rows in the shared vocabulary, each
row navigating to its unit and carrying an explicit control that moves it across. The
dialog is removed. Each transfer commits immediately as a whole-set write — the pane the
row lands in is the confirmation, so no message is raised for it — and the controls are
unavailable while a write is in flight, so two transfers cannot race with stale sets. What
locks assignment is read from the contract and stated above the panes, as it is today.

That last move puts a writing surface inside a reading one, which
[ADR 0024](../decisions/0024-units-read-as-a-directory-and-assigning-them-is-a-form.md)
placed on the shared form surface and
[ADR 0020](../decisions/0020-surfaces-diverge-by-kind-not-by-operation.md) draws its line
through. It is therefore a Decision, recorded as
[ADR 0029](../decisions/0029-a-contracts-units-are-transferred-on-the-tab-that-shows-them.md),
which overrides 0024's write half in prose and leaves the rest of both standing — the same
way 0019 and 0024 each overrode part of 0013.

## Approach

The four tickets gate none of each other and can be built in any order. The dialog fix
goes first anyway, because it is the only one that restores work the application currently
cannot do at all.

**Considered and rejected — the transfer commits on an explicit save.** One write, one
reconcile, one undo entry for a whole session of shuffling, which is cheaper than one of
each per transfer. Rejected because it puts unsaved state on a tab a reader can navigate
away from, which needs dirty tracking, a discard affordance and a leave guard — machinery
that costs more than the writes it saves, on a surface whose whole point was to stop being
a mode.

**Considered and rejected — keeping the dialog and renaming the `+`.** The smallest
possible fix for the entry point, and it was offered. Rejected by the user in favour of the
tab itself, which is the answer this document plans.

**Considered and rejected — making the weak duplicates worth pressing.** A duplicated
complex could carry its unit names, now that creating a complex creates them. Rejected as
work that argues against the finding: the copy is thin because the records are mostly
unique fields, and carrying more only moves where the emptiness shows.

## Acceptance criteria

- A contract can be terminated and restored from its own page.
- A payment can be deleted from its page and from the ledger.
- A deletion that something blocks still names what blocks it and offers nothing
  destructive.
- A deletion refused by the procedure can be attempted again without dismissing the dialog.
- The titlebar carries no undo or redo control, and both still work from the keyboard on
  every screen.
- A change that announces itself offers to take itself back in the same announcement, and
  taking it back offers to re-apply it.
- Duplicate is offered on a contract and on a payment, and on no other record; copying
  details is unchanged everywhere.
- A contract's units are added and removed on the tab that lists them, with no dialog, and
  the refusals a locked contract raises are stated before a transfer is offered.

## Risks

- **Two transfers racing with stale sets.** Each write sends the whole set, so a second
  write computed before the first settles would undo it. Detected by transferring rapidly
  and watching a unit reappear; prevented by making the controls unavailable while a write
  is in flight.
- **A reconcile per transfer.** Measured at 2.6 ms on a realistic database and 40.7 ms on
  one roughly fourteen times larger, reading whole tables regardless of what moved. A
  contract with many units is where this shows; if it does, the explicit-save shape
  rejected above is the answer, and it is recoverable.
- **The undo offer disappearing where it used to exist.** A mutation declaring an inverse
  but no success message currently reaches undo through the button and would reach nothing
  after it is removed. Detected by listing the declarations before the button goes.
- **The panes at narrow widths.** Two panes side by side is the shape that already stacks
  awkwardly in the dialog, raised on the pull request that built it. The tab is wider than
  the dialog was, which helps, and does not settle it.

## Out of scope

- **The landing screen.** Its shape is an open question in the record, with three questions
  outstanding — what the screen is, what may appear on it, and whether the two standing
  figures survive. The user has described it as a look three times, and the discussion that
  parked it names that as the signal that prose is the wrong instrument. It is gated on a
  prototype and produces no ticket here.
- **Narrowing cache invalidation.** Untouched, as it was in the effort that introduced it.
- **The whole-set unit write becoming one batch.** Already raised separately and still
  unticketed; this document makes it more visible without making it worse.

## Ticket set

Four tickets, no edges between them — none gates another.

**Root** — #211, the overhaul's map issue, at the user's instruction. This run cuts no root
of its own: the feedback is about the overhaul, so it hangs where the overhaul does.

| # | Title | Tier |
| --- | --- | --- |
| 01 | `fix(design): a confirmation offers its control unless something blocks it` | Express |
| 02 | `refactor(layout): undo leaves the titlebar for the announcement it already makes` | Express |
| 03 | `refactor(design): duplicate is offered where the copy carries something` | Express |
| 04 | `feat(contract): the units tab is the transfer surface` | Standard — part of this spec, carries ADR 0029 |
