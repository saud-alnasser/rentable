---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: implemented
---

# feat(design): the interface overhaul's third pass of feedback

## Problem

The overhaul was used again. Three things are wrong and one is missing.

**The startup screen announces a link nobody started.** Its link control reads *linking…*
whenever the screen is busy, because the label is bound to a screen-wide busy flag rather
than to the link. Choosing *open local workspace* makes the screen busy, so the control
beside it reports an operation that is not running. Settings already binds the same label to
the link itself, so the startup screen is the outlier rather than the pattern.

**Answering a conflict shows the question again before showing the application.** Settling
one clears it the moment the remote reports back, and what follows — bootstrap,
reconciliation, showing the window — runs while the startup state is still *choose the
workspace*. So the screen falls through to the entry card it shows when nothing is pending:
for the length of the tail the reader sees the card they started from, with no panel and
nothing to answer, and then the application. The same tail is behind the entry card sitting
disabled while *open local workspace* is carried out, which is what put a busy label on it
in the first place. One startup state covers both *asking* and *carrying out the answer*,
and only the first has a surface.

**The command palette's scrollbar is the platform's.** The application's scrollbar is a
class applied by hand at each scroll container. Six carry it; the palette's list is a
generated primitive and does not, so the one surface reached from every screen scrolls in a
different vocabulary from the surfaces it is reached from. Five scroll containers inside
`design/primitive/` are in the same position — the palette is where it shows.

**A record's actions are only on the record's own page.** Editing or deleting from a
directory means opening the record, acting, and coming back — and the directory is where a
reader is when they decide. The cards have no room for a row of controls, which is why they
have none.

## Goal

The startup screen shows what is happening: it asks while it is asking, and the answer it
was given stays on screen until the application is up. Every scroll container in the
application scrolls the same way. A record's actions are reachable from its card without
opening it, and clicking a card still opens it.

## Constraints

- **A row opens its record and does nothing else**
  ([[rules/row-activation]]). The card's
  click target is unchanged, and no action is reachable only from a card.
- **Duplicate is offered where the copy carries something** — a contract and a payment, and
  no other record, from the first pass of this feedback. A card menu offers no duplicate on
  a tenant or a complex.
- **The pending conflict has one owner, and its lifetime is the application's.** Every
  screen that can present one presents that same one; a screen holding its own copy of the
  question is the divergence that owner exists to prevent.
- **A flow that cannot proceed on its own returns the question, and the owner returns
  outcomes rather than driving anybody's screen.** What a host does around a conflict stays
  the host's.
- **Both locales, both directions.** A menu that opens off the edge of the window in Arabic
  is broken.
- **No touch input, and width is not input modality.** A card menu is a desktop gesture and
  is not gated on window size.

## Architecture

**The conflict's owner holds the question open across the host's continuation.** Its sibling
already does this: the link session's *finalizing* state stays true while the host's own
`resolve` handler runs, which is why the link path has never flashed. The conflict flow
settles its question the moment the remote answers and leaves the host to run the tail
unrepresented. Giving `resolve` the host's continuation closes the difference — the remote
acts, the continuation runs with the question still presented and the flow still reporting
that it is working, and the question clears when the continuation is done. Nothing is added
to any screen: the panel already renders a working state, so the spinner the reader is
watching simply continues until the application replaces it. The deferring half of dismissal
takes the same shape, because it runs the same tail.

**The startup screen's labels come from the operations.** Each of the two controls reports
its own work — the link from the link session, opening local from the choice being handled —
and neither reports the other's.

**The scrollbar is declared once, globally.** The treatment moves off its class onto every
scrollable element in the stylesheet, and the class comes off the six sites that carry it.
This is the kind of statement `app.css` is for: a desktop application has one scrollbar, and
the five containers inside `design/primitive/` cannot reach a class the composing surface
would have to remember for them.

**A card's actions are a context menu, and the card itself is the trigger.** The installed
primitive delegates its trigger to a child element, so the card's own anchor becomes the
trigger with no wrapper — the virtualized row's geometry is untouched. The menu opens at the
pointer, on the gesture the platform already uses for it, and suppresses the webview's own
menu. Clicking is unchanged.

**Each concept's directory owns its menu, and the record surface keeps its buttons.** A
directory already holds the concept's form; it gains the record the menu was opened on, the
shared confirmation, and the reads a confirmation needs — blockers are read for the one
record being acted on rather than for every row. The entries are the concept's own, from the
same domain predicates the record surface uses, so what a card offers and what a page offers
cannot disagree about whether a contract may be terminated.

The menu is an accelerator: every action it carries is also on the record's own page, which
is what keeps ADR 0025's rule intact while adding a form of row-level action it did not
anticipate. That is ADR 0033.

## Approach

The first three are independent of each other and of the menu; the menu's three build on
each other, the shared block first and a concept per ticket after it. They are declared as
one chain because this repository stacks: an edge is where the branch goes, and one linear
stack is how work lands here.

The conflict fix goes first. It is the only one whose subject is a flow with tests, so it is
the only one a reviewer can be shown rather than told about.

**Considered and rejected — handing off to the startup loader.** The host moves to its
loading state for the tail, so the screen only ever asks and the loader only ever works.
Smaller, and it needs no change to the flow at all. Rejected by the user: it replaces the
spinner the reader is already watching with a second one, which is one surface change fewer
than today rather than none.

**Considered and rejected — the screen holding the last question it was asked.** Contained
to one component and needing nothing from the flow. Rejected because it makes a second copy
of the question, which is what one owner exists to prevent, and because the panel would
still disappear the instant the remote answered.

**Considered and rejected — the hosts clearing the conflict themselves.** The flow leaves the
question presented and each host clears it when its tail is done. The same result, and it
puts a step in two hosts across three operations that a host will eventually forget — the
failure being a settled question left on the startup screen with nothing to answer.

**Considered and rejected — adding the class to the palette alone.** One attribute, and it
leaves the next scroll container free to forget in exactly the way this one did.

**Considered and rejected — a visible control on each card.** The form ADR 0025 does
anticipate. Rejected because a card is one line high and already carries a name, two
identifiers and six figures; a control inside it competes with all of them and adds a hit
target inside a link. The record's page is where controls are visible, and it has them.

**Considered and rejected — copying a record's details from its card.** Copy takes the
record's stated fields in the order the page reads them, and a card reads a different set.
Offering it from a card would copy less than the same action copies one screen away, silently.

**Considered and rejected — one action declaration shared by the page and the card.** The
page renders its actions as buttons deliberately, so the keyboard reaches them by tabbing
where it already goes; a shared list would have to carry both presentations, and unifying it
means touching five record surfaces this feedback is not about. The predicates that decide
*whether* an action is offered are already shared, which is the half that can disagree.

## Acceptance criteria

- Choosing *open local workspace* leaves the link control reading *link*, and the control
  that was pressed is the one that reports work.
- Answering a conflict at startup shows the panel with its spinner until the application
  appears, and the entry card is not shown in between.
- Deferring a conflict at startup behaves the same way.
- A conflict the remote refuses is still presented, and can be answered again.
- Answering a conflict from settings still toasts and refreshes what it always did.
- The command palette scrolls with the application's scrollbar, in both directions.
- Every other scroll container is unchanged to look at, and no surface applies a scrollbar
  class.
- Right-clicking a card in the complexes, contracts or tenants directory opens a menu of that
  record's actions; the webview's own menu does not appear.
- Clicking a card still opens the record, in both directions.
- A card's menu is reachable from the keyboard on a focused card.
- Editing from a card opens the same form the record's page opens, on that record.
- Deleting from a card asks the shared confirmation, names the record, names what blocks it
  where something does, and offers nothing destructive where something does.
- A contract card offers duplicate, and terminate or restore exactly where the contract's own
  page offers them; a tenant or complex card offers no duplicate.
- Every action a card offers is also on the record's own page.

## Risks

- **A continuation that throws leaves the question up.** The remote has acted, so the
  question is answered whatever happens next. Detected by the tests the flow already has —
  clearing belongs in the same place that runs the continuation, not after it.
- **A menu opening off the window edge on the last card, or in Arabic.** The primitive
  positions at the pointer and flips itself, and this is the part that is checked by looking
  rather than asserted. Both directions, top and bottom of a long list.
- **A per-row blockers read on every menu opening.** One read for the record acted on, when
  the menu opens — not one per row. It is the same read the record's page performs. The
  standing finding on this list's query cost is unrelated to it and is not made worse.
- **A card that is both a link and a trigger swallowing a click.** The trigger binds the
  context gesture and a long press; a mouse click is untouched. Checked by clicking.

## Out of scope

- **The dashboard's queue rows and the nested unit and payment tables.** Cards in the three
  directories only. The tables already carry a row menu of their own.
- **The record surfaces' own action controls.** Unchanged, including the decision that they
  are buttons.
- **The settings screen's link and sync labels.** Already bound to their operations.
- **The list's query cost.** The standing research finding contradicting ADR 0008 — a
  contract search that filters in TypeScript, and an unbounded tenant read — is untouched
  here and still waiting on somebody.

## Ticket set

Six tickets in one chain. **Root** — [#211](https://github.com/saud-alnasser/rentable/issues/211),
the overhaul's map issue, at the user's instruction. This run cuts no root of its own, as the
first pass did not: the feedback is about the overhaul, so it hangs where the overhaul does.

| # | Issue | Title | Tier | Blocked by |
| --- | --- | --- | --- | --- |
| 01 | #459 | `fix(sync): a settled conflict stays presented until the application is up` | Express | — |
| 02 | #460 | `fix(layout): the startup screen's busy label follows the operation` | Express | 01 |
| 03 | #461 | `refactor(design): every scroll container carries the application's scrollbar` | Express | 02 |
| 04 | #462 | `feat(design): a record card's actions are a context menu` | Standard — part of this spec, carries ADR 0033 | 03 |
| 05 | #463 | `feat(complex): the complex card carries its record's actions` | Express | 04 |
| 06 | #464 | `feat(contract): the contract card carries its record's actions` | Express | 05 |

Ticket 04 delivers the shared block and the tenant directory as its first consumer — a block
with no consumer is a component nothing exercises. Tickets 05 and 06 are a directory each;
the contract's is last because it carries the most entries and the status predicates that
gate them.
