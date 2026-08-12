---
owner: repository
status: accepted
sources:
  - src/lib/design/block/list.svelte
  - src/lib/design/cell/count.svelte
  - src/lib/design/block/record-surface.svelte
  - src/lib/design/primitive/alert-dialog/
  - src/lib/tenant/router.ts
  - src/lib/contract/component/units.svelte
---

# fix(design): the directory row, the counts it carries, and the confirmations beside it

## Problem

Eight complaints, raised together after using the record surfaces the interface overhaul
landed. They are not one defect, but they fall into four groups and each group has one cause.

**What a row says.** The complexes row's three counts do not line up down the list, where the
contracts row's do — a count cell is content-width, and three of them side by side make a ragged
right edge, while the contracts row happens to end in two fixed-width cells that hide the same
problem. The contract row's payment count is styled as state when what it counts is money. The
tenant row shows one figure for contracts in force under a generic contract glyph, which says
neither how many contracts the tenant has nor what condition any of them are in.

**What a row is.** The directories read as a table of banded rows. The request is for cards.

**What a confirmation looks like, and what it claims.** The unlink confirmation in settings sits
on a different background from every other confirmation in the application. And the delete
dialog tells the reader that deleting cannot be undone, which is false everywhere it appears:
every delete in this application registers an inverse, and the reasoning for that is
[ADR 0026](../decisions/0026-undo-is-a-session-stack-of-inverses.md)'s own.

**A record's collections run off the bottom of the window.** On a contract, the assigned and
available unit lists grow past the viewport instead of scrolling, so the page scrolls as a whole
and the panes have no bottom. And when a contract's units are locked, the surface still offers
the whole available list — a column of units next to a control that has been removed, answering
a question the reader is not allowed to ask.

## Goal

A directory row is a card that reads as an object and lines up with its neighbours; the figures
on it say what they are counting; a confirmation looks the same wherever it appears and claims
only what is true; and a record's collections get the height they were given.

## Constraints

- **Arabic and English, RTL and LTR**, both first-class. Three prototypes over these rows have
  now left RTL unexercised; this effort does not get to add a fourth without saying so.
- **The count tone vocabulary is shared with the status glyphs.** `running`/`settled` map onto
  the same two tones a status carries, deliberately, so that a count and a status never disagree
  about what blue means ([ADR 0023](../decisions/0023-a-status-is-an-icon-and-its-word-lives-in-the-tooltip.md),
  extended to counts by the `directory-row-colour` prototype). A third tone changes the rule a
  reader has to learn, from *colour means state* to *colour means state, except where it means
  money*.
- **Undo is a session stack**, not durable. Copy that promises reversibility has to say so
  within the life of the session, or it trades one false claim for another.
- **The spacing ladder** binds `p-`, `m-`, `gap-` and `space-`. A card's own dimensions are not
  on it.
- **`design/primitive/` is generated once and owned now** — an existing primitive is edited by
  hand, and only a *new* one comes from the CLI. Editing `alert-dialog` is the sanctioned
  operation; regenerating it is the one there is no way back from.
- **The tenant list is the largest**, and its query already carries a count computed on the list
  query itself rather than per row. Whatever replaces it must stay one query.

## Architecture

Four seams, and nothing crosses more than one of them.

**The count cell.** `design/cell/count.svelte` is worn by every directory row and by the
dashboard. Giving the figure a fixed measure there aligns every list at once, and is the only
change that item needs — the raggedness is not the complexes row's, it is the cell's, and fixing
it in the complexes row would leave the same latent defect in the other four.

**The colour vocabulary.** A `money` tone joins `running` and `settled` on the count cell,
backed by a colour token in `app.css`. The token matters more than the hue: this tree already
holds two greens, both written as raw palette values — `green-300` on the callout's success
variant, and `emerald-*` in the contract form marking a manually-edited end date — so green
already means two unrelated things here and neither adapts to the theme. The money tone is the
first one named, which is what stops it becoming the third.

**The tenant list query.** `tenant.getMany` today counts contracts in force with a single
aggregate over a filtered join. Six per-status figures are six conditional aggregates over the
same unfiltered join — still one query, still one row per tenant, and the sort key stays what it
is. The row then renders the status glyphs the rest of the application already uses, so the
tenant list stops having a private picture for contracts.

**The record shell's height.** `record-surface.svelte` gives its tab panel `min-h-0 flex-1`, but
the panel is a block, so a child asking for `flex-1` inside it resolves against an auto height
and grows without bound. The contract is the only record with two collections and therefore the
only one on that path; every other record takes the single-collection branch, which is a flex
column and constrains correctly. That is why the symptom appears on exactly one screen. The fix
is in the shell, and it reaches the payments ledger in the other tab as well — which is broken
today and was not reported.

## Approach

The card treatment came first and is already built, because it was the only item that could not
be settled on paper: whether a row carries elevation at rest is a question about a shadow, and a
shadow described in prose is a shadow nobody has seen. It was prototyped against the real lists
and the answer is recorded in
[directory-row-card-treatment](../evidence/prototypes/directory-row-card-treatment.md).

**The chosen variant was promoted rather than rebuilt, on the user's instruction** — `/prototype`
discards prototype code and treats promotion as a fresh implementation. The deviation is recorded
here and in the evidence file. What was promoted is the chosen variant alone; the switcher and
the two rejected variants came out.

Order after that follows the dependencies rather than the complaint list. The tenant row widens
before the count cell is asked to align, so alignment is judged against the final content. The
record shell's height is fixed before the unit panes are reshaped, because a pane cannot be shown
to scroll until something above it has a height.

**Considered and rejected.**

*Aligning the complexes row by hand*, with widths on that row's three cells. Rejected: the
raggedness belongs to the count cell, and four other lists wear the same cell. A fix at the call
site leaves the defect and adds a second place that decides how wide a figure is.

*Reusing `primary` for the payment count*, keeping two tones. Rejected by the user, and the
reason survives the choice: the money figure and the status glyph would then be the same blue on
the same row, saying two different things.

*Showing only the statuses a tenant actually holds.* Rejected by the user in favour of all six
always. The cost accepted is a row that shows mostly zeros; the benefit is that the six figures
form fixed columns down the list, which is the same property item one exists to restore, and a
variable-width cluster would have worked against it.

*Restyling the unlink dialog's colours in place* was chosen over *moving unlink onto the shared
confirmation block*. The block is named for deletion and unlinking is not a delete, so moving it
would have forced a rename touching six callers into an unrelated change. The cost accepted is
that two confirmation surfaces remain and must be kept in agreement.

*Soft-deleting, or making undo durable*, so that the delete dialog's original claim becomes true.
Out of scope and already decided against — ADR 0026 rejected both, and this is a copy defect, not
a capability gap.

## Acceptance criteria

- Every directory record renders as a card with space around it, and lifts under the pointer.
- The trailing figures on the complexes, tenants and contracts rows form straight columns down
  the list at any window width the shell supports.
- The contract row's payment count is visually distinct from the status glyph beside it, and its
  colour comes from a named token rather than a palette value.
- A tenant row shows a figure for each of the six contract statuses, using the same glyphs the
  rest of the application uses for those statuses, and each names itself on hover and to a
  screen reader.
- Sorting the tenant list by contracts still works and still orders by contracts in force.
- The unlink confirmation is indistinguishable in background, radius and shadow from the
  confirmation shown when deleting a record.
- No confirmation states that the action cannot be undone where an inverse is registered for it.
- On a contract, the assigned and available unit lists scroll within the panel, and the page
  behind them does not.
- A contract whose units are locked shows only the units it holds, and does not show the
  available list.
- The sidebar shows no glyph twice, and the dashboard's destination is distinguishable from the
  application's own mark above it.
- A page taller than the window scrolls to a bottom that has the same space beneath its last
  element as the page has above its first.
- No settings title or description names a migration, a snapshot, a workspace unlink, or any
  other mechanism the reader cannot act on.
- Both locales, in both directions, at the smallest window the shell supports.

## Risks

- **The tenant row runs out of width.** Six glyph-and-figure pairs plus a name is the widest row
  in the application, and the smallest supported window is where it fails first. Detected by
  opening the tenant list at that width in both directions before the ticket closes — not by
  reasoning about it, which is what left the three-count cluster unchecked.
- **Six conditional aggregates change the tenant list's cost.** The existing measurement in
  `interface-performance-baseline` was taken against a single aggregate. Detected by comparing
  the query count, which must stay at one; the payload grows by five integers per row, which is
  bounded and does not need measuring.
- **The card treatment gave up the row clip.** A record that outgrows its declared height now
  overlaps its neighbour instead of being cut off. Detected the same way it always was — by
  looking — and fixed the same way, by raising the declared height.
- **The settings rewrite lands in a language this session cannot judge.** Half the copy is
  Arabic, and a rewrite that reads well in English and stiffly in Arabic is a regression nobody
  here can detect. Detected only by the user reading the Arabic side before the ticket closes;
  there is no other check, and saying so is the mitigation.
- **Scroll cost is no longer described by the recorded baseline.** Every visible row gained a
  shadow and a ring and lost a clip. Nothing here measures that, and the earlier figures should
  not be quoted against the new list.

## Out of scope

- The complexes CSV export, which still writes the columns it wrote before the row gained an
  occupied figure. Its own ticket, not this effort's work.
- The two untokenised greens already in the tree. Naming the money colour does not license
  rewriting the callout's success variant or the contract form's manually-edited marker; that is
  its own ticket.
- Renaming the shared confirmation block, which the unlink decision deliberately avoided.
- Any change to what undo covers. The copy is corrected to match the behaviour, not the reverse.
- Virtualizing the payments ledger, which shares the height defect but not the reshaping.

## Tickets

Fifteen, all under [#211](https://github.com/saud-alnasser/rentable/issues/211) — this effort
opens no root of its own, on the user's instruction. The edges are real dependencies rather than
a preferred reading order: this repository builds one linear stack, so everything is ordered
anyway, but only these four edges would break the work if it were not.

| Issue | Ticket | Blocked by | Why the edge |
| --- | --- | --- | --- |
| [#415](https://github.com/saud-alnasser/rentable/issues/415) | a directory record is a card | — | carries the promoted treatment |
| [#416](https://github.com/saud-alnasser/rentable/issues/416) | a record's collections get the height they were given | — | |
| [#417](https://github.com/saud-alnasser/rentable/issues/417) | a tenant's contracts are read by status | — | |
| [#418](https://github.com/saud-alnasser/rentable/issues/418) | the unlink confirmation matches every other one | — | |
| [#419](https://github.com/saud-alnasser/rentable/issues/419) | no confirmation claims a delete is permanent | — | |
| [#420](https://github.com/saud-alnasser/rentable/issues/420) | the dashboard has a glyph of its own | — | |
| [#421](https://github.com/saud-alnasser/rentable/issues/421) | a page that outgrows the window keeps its bottom margin | — | |
| [#422](https://github.com/saud-alnasser/rentable/issues/422) | the remaining balance survives editing a payment | — | |
| [#423](https://github.com/saud-alnasser/rentable/issues/423) | a payment cannot be dated in the future | — | |
| [#424](https://github.com/saud-alnasser/rentable/issues/424) | the complexes export writes the occupied figure its row shows | — | |
| [#425](https://github.com/saud-alnasser/rentable/issues/425) | the greens in the interface are named rather than hardcoded | — | |
| [#426](https://github.com/saud-alnasser/rentable/issues/426) | a count cell's figure has one measure | #417 | alignment is judged against the widest row, which #417 creates |
| [#427](https://github.com/saud-alnasser/rentable/issues/427) | the payment count reads as money | #426 | the same cell, and the measure is settled before a tone is added to it |
| [#428](https://github.com/saud-alnasser/rentable/issues/428) | a locked contract shows only the units it holds | #416 | a pane cannot be shown to scroll until something above it has a height |
| [#429](https://github.com/saud-alnasser/rentable/issues/429) | the settings copy says what it does in the reader's words | #421 | reading the copy at the bottom of the page requires the bottom of the page |

Four of these were raised after the sections above were written, and their reasoning is here rather
than above: **#422** and **#423** came out of reading the payment surface while the card work was in
flight — the first a defect the reading found, the second a rule the domain never had. **#424** and
**#425** were named *Out of scope* below and are tracked rather than dropped: each is a real defect
this effort deliberately does not fix, and an out-of-scope note with no ticket behind it is how a
known defect becomes an unknown one.

**01 — a directory record is a card.** Directory rows render as cards with 12px between them,
resting elevation, and a lift under the pointer; the list's own frame goes, since the cards carry
their edges. The treatment is one declaration in the list block, worn by each concept's own
anchor. The scroll viewport carries a top inset of the same measure as the gap, without which the
topmost card's rise is cut by the scroll edge and reads as the card sliding under the toolbar.
Carries the promoted code; the write-up and the deviation that promoted it land with this
document.

**A grouped list stops pinning its header, and this is decided here rather than by the prototype**,
which recorded grouped lists as the one thing it did not judge. A header pinned over the records is
a third surface floating above a list that now reads in two, and it only ever worked because it
could keep a solid background to hide full-bleed rows sliding under it — with space between the
cards there is nothing left to hide behind. So the header becomes a card of its own in the same
rhythm, sized to what it says rather than to the list's width, scrolling with the records it opens:
quieter than a record, because the records are what the reader came for, and separating by being a
different kind of surface rather than by staying in view. Full width would have made it one more
card in the column, which is the reading that stopped the grouping being legible in the first
place.

**02 — a record's collections get the height they were given.** The record shell's tab panel
becomes a flex column, so a collection inside it resolves against a real height. Fixes the
contract's unit panes and its payments ledger together. Verified by scrolling both.

**03 — a tenant's contracts are read by status.** `tenant.getMany` returns a figure per contract
status, as conditional aggregates over the existing join — one query, one row per tenant. The row
renders all six using the application's own status glyphs, each naming itself on hover and to a
screen reader. The sort key keeps its present meaning. The CSV export follows the row, since the
export's columns are the row's. Router tests cover a tenant with contracts in several states, a
tenant with none, and the ordering.

**04 — a count cell's figure has one measure.** The figure in the count cell takes a fixed
measure so the trailing cluster forms columns down the list. Touches the shared cell only; every
directory and the dashboard inherit it. Verified against the complexes and tenant rows at the
smallest supported window, both directions.

**05 — the payment count reads as money.** A `money` tone joins the count cell's vocabulary,
backed by a named colour token in the stylesheet — the first tokenised green here. The contract
row's payment count takes it. The tone's meaning is documented on the cell, because it is the
one entry that is not keyed on state.

**06 — the unlink confirmation matches every other one.** The alert-dialog primitive's content
takes the background, radius, shadow and ring the dialog primitive's content already has, by
hand. Verified by opening the unlink confirmation and a record deletion side by side.

**07 — no confirmation claims a delete is permanent.** The delete dialog's description stops
saying the action cannot be undone and says what is true instead — that it can be reversed while
the application is open. Both locales, regenerated types. The three unused backup-deletion strings
found alongside are removed in the same change, since they make the same false claim and have no
reader.

**08 — a locked contract shows only the units it holds.** Both unit panes virtualize and scroll
within the panel. A contract whose units are locked shows the assigned pane alone, laid out as a
grid, and the available pane is not rendered — the lock notice already says why.

**09 — the dashboard has a glyph of its own.** The dashboard's destination currently wears the
same glyph the sidebar uses as the application's mark, so the rail shows one picture twice
meaning two different things — the brand above, a destination below. The dashboard takes a glyph
of its own; the mark keeps the one it has. It takes the dashboard-layout glyph — the conventional
picture, and the one a reader arrives with.

**Not the layout *grid*, which is a different drawing and is already spoken for**: the complexes
row uses it for a complex's unit total, where the `directory-row-colour` prototype chose it
because it reads as *the spaces themselves*. The dashboard glyph is the asymmetric-panel one, so
the rail and the row do not end up wearing the same picture for unrelated things — which is the
defect this ticket exists to remove, and would be a poor thing to reintroduce while fixing it.

**10 — a page that outgrows the window keeps its bottom margin.** The page frame is a flex item
inside the shell's scrolling column, so on a page taller than the window it stays exactly one
viewport high and its content spills past it. Its own bottom padding therefore sits at the
viewport's edge rather than after the last element, and the page ends flush against the window.
Settings is where this shows because settings is the longest page, but the defect is the shell's
and reaches every page that scrolls. The fix belongs in the shell, not in settings.

**The frame grows with its content, and a page needing a window-height frame asks for it.** The
frame is a flex item today because the directories need it to be: their lists scroll internally
and must be exactly as tall as the window. Settings needs the opposite, and every page is
currently served the directories' answer. Making the growing case the default and the fixed case
opt-in matches what the two kinds of page actually are, rather than patching the symptom where it
happens to show.

The cost is that every route wanting the window-height frame has to say so, and each has to be
re-checked for internal scrolling once it does — that check is the ticket's real work, not the
declaration.

*Rejected: the scrolling column carries the bottom space.* One declaration, fixes the visible
symptom everywhere. Rejected because it leaves the frame's own padding doing nothing at the
bottom whenever a page overflows — right on screen, and misleading to the next reader, who finds
two places claiming to own the same space and only one of them working.

**11 — settings says what it does in the reader's words.** The settings copy is written in
implementation vocabulary in about half its entries — *reruns migrations on the selected database
path*, *unlink cleanup*, *the latest synchronization and snapshot timestamps* — beside entries
that are already plain. Each title and description is rewritten to say what the setting does for
the reader and what changes if they touch it, in both locales, keeping the lower-case register
the application already uses. No setting changes behaviour.

**A title or description that says nothing is removed rather than rewritten**, which this section
originally forbade — the user's instruction was that some entries are duplicated or should not be
there at all, and _Separate visual hierarchy from document hierarchy_ (54) is the reference's own
answer to it: a section title is a label rather than a heading, and where the content speaks for
itself the title can go entirely. Three group legends had a single row under them repeating the
legend word for word, the page opened by listing the four groups whose legends sit directly below
it, and the settings failure stated itself between a title and the error text that followed. Those
six entries come out. **The dead copy already in the settings namespace is not this ticket's** —
about a third of it has no reader at all, which is a finding of its own rather than a rewrite.
