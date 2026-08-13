---
owner: repository
status: accepted
sources:
  - src/lib/design/block/record-card.svelte
  - src/lib/design/block/list.svelte
  - src/lib/contract/component/record.svelte
  - src/lib/contract/component/directory.svelte
  - src/lib/payment/component/ledger.svelte
  - src/lib/complex/component/unit-directory.svelte
---

# feat(design): a record card carries its actions twice

## Problem

Three different things happen when a reader wants to act on a record they can see in a list,
and which one depends on which list they are looking at.

A card in the tenants, complexes or contracts directory offers its actions only to a
right-click — there is nothing on the card to say so, and nothing the keyboard can reach. A
card in a complex's units, or a payment in a contract's statement, offers the opposite: a
visible menu button and no response to a right-click. A contract listed inside a unit or a
tenant offers neither, so the only way to terminate a contract met on a unit's page is to open
the contract first.

The last of those is the one that was reported. The other two are the same defect seen from
either side: the reader has to know which surface they are on before they know how to act on
what is in front of them, which is the condition [ADR 0025](../decisions/0025-a-row-opens-its-record-and-does-nothing-else.md)
was written to end for the click and did not end for the actions.

Two further faults were found while reading, both of them live:

- **A card whose actions are a context menu is no longer reachable by the keyboard at all.**
  The context-menu trigger contributes `tabindex="-1"` to whatever element it is spread onto,
  and the prop merge keeps it when the caller states no value of its own. Three directories
  spread those props straight onto the card's link, so the link left the tab order the moment
  the menu was added — the cards cannot be tabbed to, and the actions are unreachable without a
  pointer.
- **A unit's own page carries neither edit nor delete**, because a unit is created and edited
  from the complex holding it. So the two actions on a unit card are not redundant with
  anything on the record's page, which is the condition ADR 0033 permitted the hidden gesture
  under.

## Goal

Every record card in the application offers the same actions the same two ways — a quiet
control on the card, and the platform's context gesture — so what a reader can do to a record
they can see does not depend on which list they found it in.

## Constraints

- **Arabic and English, RTL and LTR.** A control at the card's inline end and a menu that
  opens at the pointer both have a mirrored case, and a card that only works in one direction
  is broken.
- **No touch input.** The long-press path the context-menu primitive also offers is not a
  route this application has, so the visible control is the only non-pointer route and the
  keyboard has to reach it.
- **The list lays its cards out at a declared height** and does not measure them, so nothing
  added to a card may change how tall it is.
- **A terminated contract is locked**, so a payment in its statement offers nothing; a card
  with no actions shows neither route rather than an empty menu.
- **Every action a card offers is one the record's own surfaces already offer** on the same
  terms, decided by the same domain predicates — a card and a page cannot come to disagree
  about what may be done to a record.

## Architecture

The two markup patterns in the tree today are what force the choice between the two
mechanisms, and neither can hold both.

A card built as one link wrapping its whole content can carry a context menu, because the
trigger's props go on the link — but it cannot carry a button, because a button inside a link
is not something a pointer or a keyboard can reach. A card built as a container with the link
stretched behind it can carry a button, and today carries only that.

The second pattern is the one that holds both, so **one block owns it for every card**: the
container is the context-menu trigger, the record's link is stretched behind the content and is
the card's single tab stop, and the visible control sits at the inline end. Both routes read
one list of actions, so a card cannot offer one thing to a right-click and another to the
button. The block hands the card's own content back to the surface as a snippet, so what a
tenant card and a payment card put in the middle stays theirs.

That resolves the keyboard fault by construction as well as by intent: the trigger is the
container, which was never a tab stop, and the tab stop is the link inside it, which the
trigger never touches.

The visible control is the **tertiary** treatment already in the tree — a quiet ghost glyph,
not a competing button (_Semantics are secondary_, p. 60: actions low in the pyramid should be
"discoverable but unobtrusive"). Where it would compete with the figures beside it on the
busiest card, the answer is to soften those figures rather than to drop the control
(_Emphasize by de-emphasizing_, p. 46).

**The two routes are not equals.** The control is what the card promises and the gesture is
derived from the same list, holding nothing the control does not; where they would diverge, the
gesture goes. ADR 0034 carries the rule and the reason the gesture is kept at all — nothing in
this repository claims the webview's own context menu, so a card that ignores right-click leaves
the reader whatever the webview does, chosen by nobody.

The contract is the one record whose action set is not two entries: it duplicates, edits,
terminates, restores and deletes, each behind its own confirmation, and two of those are
permitted only for certain statuses. That set exists once today, inside the contracts
directory, and three surfaces need it. It moves to one home in the contract concept, which
every surface listing a contract renders — so the terms a contract may be terminated on are
stated once, and a unit's page cannot come to disagree with the directory about them.

## Approach

The shared block comes first, with one surface moved onto it in the same change, so the
pattern is demonstrated on a real card before five more depend on it. The tenant card is that
surface: the simplest content, and its action set is already a list.

The keyboard fault is fixed **before** that, on its own, because it is live on the default
branch now and the fix belongs in the block either way — a card's own element decides whether
it is a tab stop, and the menu wrapped around it does not get a say.

Then the remaining cards move across: the two that have a visible control and need the gesture,
the one that has the gesture and needs the control, and finally the contract card, whose
action set is extracted before the two surfaces that have never had one are given it.

**Considered and rejected:**

- **Leave the directories on the context menu and give only a unit's contracts both**, which is
  what was asked before the pattern was made uniform. It is the cheapest change by a wide
  margin, and it leaves one component rendering a card that behaves differently on each of the
  three surfaces that render it — the divergence that component exists to prevent.
- **A visible control on every card and no context gesture.** One mechanism, no hidden
  affordance, and it would have been the simpler decision had it come first. It gives up the
  accelerator on the two actions a reader most often decides on while looking at a list, and
  the gesture costs nothing once the block owns it.
- **Reveal the control on hover.** Keeps the card quiet at rest, and is invisible to the
  keyboard — which makes it a worse accelerator than the gesture and no more discoverable than
  it. Already rejected once, in ADR 0033.
- **Keep both markup patterns and let each surface wire whichever mechanisms it can.** No
  restructuring, and it makes the uniformity a thing every future surface has to remember
  rather than a thing it inherits — which is how the three families in the tree today came
  about.
- **Give the contract card its action set per surface.** No extraction, and it would copy the
  status predicates and three confirmations into two more files, where the terms a contract may
  be restored on could drift a surface at a time.
- **Add the actions to the landing screen's queue rows too.** They name contract records, so
  the uniform rule appears to reach them. They are a preview inside a section card rather than
  record cards, they have never carried actions, and the briefing's job is to be read and
  clicked through — the rule is scoped to the record card, and the queue row is not one.

## Acceptance criteria

- Every record card in the application — tenants, complexes, contracts, a complex's units, a
  contract's payments, a unit's contracts, a tenant's contracts — offers the same actions from
  a visible control on the card and from a right-click on the card.
- Tabbing through any list of record cards reaches each card in turn, and reaching a card puts
  the keyboard within reach of its actions without a pointer.
- A contract met on a unit's page or a tenant's page offers what a contract met in the
  directory offers, refuses what the directory refuses, and asks the same confirmation with the
  same wording.
- A payment in a terminated contract's statement offers no actions by either route.
- No card changes height, and every card behaves the same way in Arabic as in English.
- Acting on a card acts on that card's record — the card acted on is the one under the pointer,
  or the one the keyboard is on.

## Risks

- **The visible control crowds the contract card**, which already carries a name, a government
  id, a date range, a payment count, a status and a fulfillment figure. Detected by looking at
  the contracts directory at both locales after the contract card moves across; the answer if
  it reads as crowded is to soften the figures, not to drop the control.
- **A right-click on the visible control has two plausible readings** — the card's context menu,
  or the browser's default on a button. The primitive opens the card's menu unless something
  beneath it prevents the default, so this is a check rather than an unknown: right-click the
  control itself on a migrated card and confirm one menu opens.
- **Six surfaces move onto one block, and the block is new.** The tracer surface in the first
  change is what makes a wrong shape cheap to correct; a fault found after all six have moved
  is six branches deep in a stack.
- **The contract extraction touches work that merged yesterday.** The directory's behaviour is
  covered by the criteria above rather than by tests, so the check is that the directory still
  does what it did — every entry, every confirmation, every refusal.

## Out of scope

- **The landing screen's queue rows**, for the reason under Approach.
- **What the record's own pages offer.** A unit page with no edit and no delete is a gap this
  design notices and does not close; the card is where a unit is edited today, and moving that
  is its own question.
- **The waiting finding against [ADR 0008](../decisions/0008-one-list-block-replaces-both.md)**
  — `.claude/evidence/research/interface-performance-baseline.md` records that the table
  component ADR 0008 argues against renders nothing in the shipped application, and that the
  blur criterion #211 states as structural is not supported by any frame measurement. Both
  contradict premises #211 and ADR 0008 are written on, both are still waiting, and neither is
  healed here — this effort touches the cards inside the list block and not the decision about
  the block itself. Raised again rather than consumed.
- **Search and reconcile cost**, from the same finding.

## Ticket set

Under [#211](https://github.com/saud-alnasser/rentable/issues/211), at the user's instruction —
this is the third pass of the interface overhaul's feedback and the fourth set beneath it.

| # | Title | Blocked by |
| --- | --- | --- |
| 01 | `fix(design): a card's menu leaves the card in the tab order` | — |
| 02 | `feat(design): a record card carries its actions twice` | 01 |
| 03 | `feat(design): every remaining directory card carries both routes` | 02 |
| 04 | `refactor(contract): the contract card's actions have one home` | 02 |
| 05 | `feat(complex): a unit's contracts carry their actions` | 04 |
| 06 | `feat(tenant): a tenant's contracts carry their actions` | 04 |

Ticket 02 carries the tenant directory as its first surface, so the block ships demonstrated
rather than on its own. Ticket 03 carries the three that only change mechanism — the complexes
directory, a complex's units, and a contract's payments. The decision this set implements is
[ADR 0034](../decisions/0034-a-record-card-carries-its-actions-twice.md), which supersedes
ADR 0033.
