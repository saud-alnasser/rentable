---
aep: 2.2.0
owner: repository
date: 2026-08-17
kind: spec
status: implemented
---

# feat(app): reversible work and reachable records

## Problem

**Nothing the user does to a record can be taken back.** A mistyped amount, a tenant deleted
in the wrong row, a unit assigned to the wrong contract — each is final the moment it is
confirmed, and the only recovery on offer throws away every change since the last snapshot.
The interface has been shaped around that: it asks before every deletion, in the same words
whatever is being deleted, and it only says what would block the deletion *after* the
destructive control is pressed.

**A record can only be reached by walking to it.** The palette opens on a keystroke and
reaches pages, never records, so finding one tenant among hundreds means choosing the right
directory first and then searching inside it. Nothing can be copied out of a record, so the
phone number needed to chase a payment is read off the screen and typed again elsewhere.
Nothing can be duplicated, so next year's contract for the same tenant is entered from
scratch. Nothing can be exported, so a list this application holds reaches nobody else at all
— in an application with no server, which makes it the only way out.

**A mutation is written twice, and the second half is repetition.** Fifteen data mutations
exist as procedures; each also has a hook differing from its siblings in two facts — the
procedure it calls and the message it shows — with about twenty lines repeated around them.
The drift that produces is already visible: two deletions of the same shape, one checking its
result before invalidating the cache and one not, with nothing recording why. Undo would add
a fourth obligation to every one of those fifteen places.

Four flows make the user do the application's bookkeeping:

- **A complex arrives empty.** Creating one and filling it with units is a create, a
  navigation, a tab, and then one dialog per unit — for a building whose units are the reason
  it was entered.
- **Assigning units to a contract only adds.** One complex at a time from a dropdown, no
  search, no sense of what has been picked, and removing one is a separate control in a
  separate place with its own confirmation.
- **Back goes to a fixed place, not to where you came from.** Open a unit from a contract and
  the back control returns to complexes, because it is a link to the concept's directory
  rather than a return.
- **The workspace section and the startup conflict surface say too much.** Both were made
  consistent recently; neither was made shorter. The workspace section stacks an avatar, two
  badges, three statistic tiles, a button pair, a conflict panel and an error callout in one
  box. The conflict surface adds a two-column local-versus-remote comparison, each side with
  its own badges, timestamps and filename — in front of a user trying to start the
  application, who has been asked a yes-or-no question.

## Goal

A mistake can be taken back for as long as the session lasts; any record can be found, copied,
duplicated or exported from wherever the user is; the flows that produce records finish in one
pass; and a mutation states what it is instead of repeating how it works.

## Constraints

- **Both locales are first class, and the floor is 640×480.** A two-pane transfer has no
  physical left, and cannot assume room for two panes.
- **Keyboard shortcuts match by physical key as well as by character**, so an Arabic layout
  reaches them — the machinery exists and is already used by the sidebar and the palette.
- **Undo is not rollback and not restore.** Both words are taken, by the protected update
  backup and by snapshots.
- **Every mutation reconciles and schedules a push to the remote.** Anything that reverses a
  mutation is a mutation and owes both.
- **A write that must not half-apply issues one batch** — the boundary runs a batch inside a
  transaction ([[rules/data]], under *Multi-table writes*).
- **Routers keep reaching the database directly** — no abstraction is added at that seam
  (ADR 0002).
- Blue is the only accent; the primitives are a permanent fork and are edited by hand, never
  regenerated (ADR 0007).
- Lists load whole result sets ([[rules/data]], under *List reads*),
  which is what makes finding and exporting records cheap to build and is not revisited here.

## Architecture

### A mutation is declared once

One declaration per mutation carrying what varies — the call, the message, what it touches,
and its inverse — with the hook, the cache invalidation and the undo entry derived from it.
It sits on the caller side, where the shared mutation helper already sits, and **does not
reach into the routers**: autosync and the reconcile touch-set stay the procedure's own,
because consolidating those is the layer ADR 0002 rejected arriving by another road.
[[rules/data]], under *Mutation declaration*, records the
boundary and what it costs.

The declaration names what a mutation touches from the start, but **invalidation stays coarse
in this effort**. Narrowing it is then a change in one place rather than fifteen, and it can
be taken alone — a wrong touch-set shows a stale row, which is wrong data rather than slow
data.

### Undo is a stack of inverses

A mutation that succeeds pushes the call that reverses it; undo pops the top entry and issues
it through the ordinary procedure, so the domain rules, the reconcile and the autosync push
all happen as they do for anything typed. Redo re-issues the original. The stack is cleared
whenever the workspace underneath it is replaced — a sync pull, a backup restore, a workspace
switch — and does not outlive the session.
[[rules/data]], under *Undo*, carries the reasoning and
the two rejected alternatives.

Inverses divide in two, and the seam splits two tickets. **Row-shaped** inverses reverse a
change to one record: a creation is undone by deleting the id that came back, an edit by
writing the captured prior row, a deletion by inserting the captured row with the identity it
had. **Set-shaped** inverses reverse a change to a relationship or a lock: a contract's units
are restored to exactly the set they were, and terminating is reversed by the procedure that
already exists to un-terminate.

Two procedures need surface they do not have: creating a record with a stated identity rather
than an engine-assigned one, and setting a contract's units to a given set rather than adding
to them. The second is also what the transfer needs, which is why that ticket comes first.

**Undo is reachable two ways and visible one.** The shortcut pair is bound through the shared
predicate so it matches on either layout, and stands down while focus is inside an editable
field, where those keys mean the text editor's undo and always will. The visible half is a
pair of controls in the shell, disabled when that side of the stack is empty, each naming what
it would do — the icon-and-tooltip vocabulary the record surfaces already speak.

### Records become reachable

**The palette finds records.** The surface exists and reaches only destinations; it gains the
records themselves, grouped by concept, opening the record's own page — which is what every
row already does ([[rules/interface]], under *Row activation*).

**A record can be copied and duplicated.** Copying puts a stated detail on the clipboard — a
phone number, a reference, an amount — from the record's own surface. Duplicating opens the
create form pre-filled with everything except what must be unique, which is a use of the form
surface it already supports rather than a new kind of surface.

**A directory exports what it is showing** — the same search and the same order, as a file.
It reads nothing new: the list already holds the whole result set.

### The four flows

**Creating a complex creates its units, in one write.** The form gains a unit list — names
entered, added and removed before anything is submitted — then the complex and every unit go
down as one batch. Nothing is created if anything is refused. Because the units arrive as a
set, the flow must refuse a collision *within* the set as well as against what is stored, a
case one-dialog-at-a-time could not produce.

**A contract's units are chosen by transfer, not by accumulation.** Available on one side,
assigned on the other, moved either way, committed once. It stays a form on the shared form
surface — it writes, so ADR 0020's line puts it there — and
[[rules/interface]], under *Unit presentation*, is
unaffected: the tab that *reads* the contract's units stays a directory. What changes is that
the form now expresses removal too, so the per-row remove control and its confirmation come
off the directory row. Below the shell breakpoint the panes stack rather than sitting side by
side, and the controls are add and remove rather than any direction, which has no meaning in a
mirrored layout. The rules locking assignment — a terminated contract, a contract with a
payment recorded — are the contract module's and are untouched.

**Back returns to the previous screen in the application**, falling back to the concept's
directory when there is none, or when the previous screen was the record just deleted. Section
changes inside a detail view already replace rather than push, so back does not walk backwards
through tabs.

**The delete dialog states the record and its dependents before offering anything
destructive.** Where a dependent blocks the deletion, the dialog says which and offers no
destructive control at all — instead of today's path, where the refusal arrives as an error
after the control is pressed. It stays a shared confirmation rather than becoming a form,
which is ADR 0020's explicit call.

### The two sync surfaces

Reduced, not restructured. The shared presentation table stays the single home for what each
kind of conflict is called and what it offers; what changes is how much of it reaches the
screen at once. The conflict surface leads with the question and the two answers, and the
provenance behind it — both timestamps, the remote filename, which side is newer — moves
behind the same icons and tooltips the records use. The workspace section states each fact
once and drops the statistic tiles restating what the rows below them already say. On both,
the control that is working is the one that shows it, rather than every control disabling
together.

## Approach

**The declaration goes first**, because it is what makes undo one field rather than a
fifteenth thing to remember in fifteen places — *make the change easy, then make the easy
change*. It is added beside the existing hooks and migrated concept by concept, so the tree is
green at every step and no ticket depends on a half-migrated state.

The remaining risk is undo, and it is risky in one specific way: an inverse is a statement
about a database, and this application replaces its database underneath the running session
whenever a sync pull wins. So the clearing rule goes in with the first inverse, and the test
that proves it is an end-to-end one over the real caller.

The transfer lands before the set-shaped inverses, because it is what turns assignment into a
set operation and gives that inverse something to say. The four reachability tickets and the
remaining surface tickets gate on nothing and can land in any order.

Rejected on the way:

- **A durable journal of row images.** It has to answer whose history survives a conflict
  resolution, and there is no answer that is not either discarding it or a merge this
  application has never had. ADR 0026 carries the reasoning.
- **Soft deletes.** Every delete that succeeds here already removes one childless row, so they
  buy nothing for undo and tax every read. ADR 0026 carries the reasoning.
- **Extending the declaration into the routers**, so autosync and reconcile derive from it
  too. That is the seam ADR 0002 closed. ADR 0028 says so explicitly, because it is the
  obvious next step and it is the wrong one.
- **Narrowing cache invalidation in this effort.** Deliberately deferred, not forgotten.
- **Restructuring the routers** — splitting the 818-line contract router. Worth doing and not
  here: it would touch every procedure the rest of this effort also touches.
- **Assigning units during contract creation.** The one-pass argument that applies to a complex
  does not transfer: a complex's units are its own records, created with it, while a contract's
  units are links to records that already exist and are competed for.
- **Removing the delete confirmation** once undo exists. Confirmation stays on every deletion;
  what changes is that it becomes informative.
- **Multi-select and bulk actions.** Powerful, and not small: it changes what a row is, which
  ADR 0025 settled recently.

## Acceptance criteria

- Adding a data mutation means writing one declaration; nothing about its cache invalidation
  or its undo entry is written by hand.
- Creating, editing or deleting any record can be reversed with the keyboard, and reversed
  again forward, with the record returning to the identity it had.
- The same is true of assigning or removing a contract's units, and of terminating a contract.
- The undo controls in the shell say what they would undo before they are used, and are
  disabled when there is nothing to undo.
- The shortcut does nothing while the caret is in a text field, where it performs the text
  editor's own undo instead.
- After the remote replaces the local workspace, nothing on the stack can be applied.
- The palette finds a tenant, complex, unit, contract or payment by name and opens it.
- A record's stated details can be put on the clipboard from the record's own surface.
- A record can be duplicated into a pre-filled create form, with the fields that must be
  unique left empty.
- A directory exports exactly the rows it is showing, in the order it is showing them.
- A complex and its units are created in one submission; refusing any part creates nothing,
  including the complex.
- Two units entered under one name in that submission are refused, naming the collision.
- A contract's units are chosen and removed in one surface, committed once, and the surface is
  usable at 640×480 and in Arabic.
- Opening a record from any screen and pressing back returns to that screen; opening one
  directly and pressing back reaches its directory.
- The delete confirmation names the record and, where something blocks the deletion, says what
  and offers no destructive control.
- The startup conflict surface presents the question and its answers without the comparison
  table; the detail behind it is reachable without leaving the surface.
- The workspace section states no figure twice.

## Risks

- **An inverse applied to a workspace that moved.** The failure is silent corruption rather
  than an error. Detected by an end-to-end test that pulls a remote workspace with entries on
  the stack and asserts the stack is empty.
- **Identity collision on restoring a deleted record.** The engine assigns the next id above
  the highest in use, so deleting the highest-numbered record and creating another takes the
  id back; undoing the deletion then collides. Detected by a test that does exactly that.
- **The migration to declarations is where behaviour hides.** The hooks are not quite
  identical today — one deletion checks its result before invalidating and its sibling does
  not — so a migration that assumes they are will change behaviour while looking mechanical.
  Each difference is resolved deliberately and named in the commit, not smoothed over.
- **The transfer at the floor.** Two panes at 640×480 is the constraint most likely to force a
  rethink of the surface rather than a tweak. Found early by building the narrow layout first.
- **Undo shortcut versus the webview's own.** The text-field exemption is easy to write and
  easy to get subtly wrong — a rich control that is not an input element still takes typing.
- **Export leaking more than the screen shows.** A directory row shows less than the query
  returns; an export written from the query rather than from the row would put fields on disk
  the user never chose to see. Written from what the list renders.
- **Coverage is by convention.** A mutation added later with no declaration is silently
  outside undo; nothing fails. Accepted, as ADR 0026 and ADR 0028 record.

## Out of scope

- Soft deletes, a restore view, or any recovery that outlives the session.
- Undo of workspace operations — linking, unlinking, restoring a snapshot, changing settings.
- Narrowing cache invalidation to the declared touch-set.
- Splitting the routers.
- Multi-select and bulk actions on directories.
- The landing screen, which ADR 0025 reopened and which is still an open question.
- Assigning units while creating a contract.
- Pagination, or any change to how lists load.

## Tickets

Created under #211, the map that roots every effort in the interface overhaul.

| # | Issue | Title | Blocked by |
| --- | --- | --- | --- |
| 01 | #332 | `refactor(design): a mutation is declared once` | — |
| 02 | #333 | `feat(design): undo and redo reverse the last record change` | #332 |
| 03 | #334 | `feat(contract): assigning units is a transfer between two panes` | #332 |
| 04 | #335 | `feat(contract): undo reverses unit assignment and termination` | #333, #334 |
| 05 | #336 | `feat(complex): creating a complex creates its units` | #332 |
| 06 | #337 | `feat(layout): the palette finds records` | — |
| 07 | #338 | `feat(design): a record can be copied and duplicated` | — |
| 08 | #339 | `feat(design): a directory exports what it is showing` | — |
| 09 | #340 | `feat(layout): the back control returns to the screen that opened the record` | — |
| 10 | #341 | `feat(design): the delete confirmation names the record and what blocks it` | — |
| 11 | #342 | `refactor(sync): the workspace and conflict surfaces say less` | — |

**01 — a mutation is declared once.** The declaration and the derivation of the hook, the
invalidation and the undo entry from it, with all fifteen data mutations migrated onto it. The
prefactor: nothing after it writes a mutation by hand.

**02 — undo and redo reverse the last record change.** The stack, the clearing rule, the
shortcut pair and the shell controls, with row-shaped inverses for creating, editing and
deleting every record.

**03 — assigning units is a transfer between two panes.** Both directions in one surface,
committed once, with the assignment procedure becoming a set operation. The per-row remove
control and its confirmation leave the units directory.

**04 — undo reverses unit assignment and termination.** The set-shaped inverses. Blocked by 03
because that ticket makes assignment a set operation, and by 02 because that one builds the
stack.

**05 — creating a complex creates its units.** The complex form gains a unit list and submits
one batch; carries the correction to [[contexts/persistence]] — found as drift, since the batch
transport had always been a transaction while the Context asserted otherwise — because this
is the change that moves the statement's practical half.

**06 — the palette finds records.** Records alongside destinations, grouped by concept,
opening the record's page.

**07 — a record can be copied and duplicated.** Both are affordances on a record's own
surface, which is why they are one ticket rather than two.

**08 — a directory exports what it is showing.** Written from the rendered rows, not from the
query behind them.

**09 — the back control returns to the screen that opened the record.** In-application history
with the directory as fallback, on every detail surface that has a back control.

**10 — the delete confirmation names the record and what blocks it.** Dependents read and
stated before anything destructive is offered; the blocked case refuses in the dialog rather
than after it.

**11 — the workspace and conflict surfaces say less.** One ticket because both read the same
shared conflict panel, and splitting them would have one rewriting what the other hosts.
