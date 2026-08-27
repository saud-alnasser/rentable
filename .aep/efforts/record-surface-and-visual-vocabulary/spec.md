---
status: implemented
---


# refactor(design): the record surface is one shell, and the vocabulary it uses is the application's

## Problem

**A record's own screen is the application's most-repeated surface and its least-owned
one.** Every concept has one — a contract, a tenant, a complex, a unit, a payment — and
each was written by hand. Five components carry it, and between them they hold a
byte-identical loading state, a byte-identical not-found state, and the same header
arrangement of a back control, an action cluster, and a title over an eyebrow and a
subline. Four of the five then open a tabs shell whose first tab is an information card
holding a grid of bordered field tiles. The mechanism is copied five times, so it drifts at
four of them: the header spacing already disagrees, the trailing page padding already
disagrees, and the surface that a reader meets most often is the one nothing owns.

**It also reads flat.** Every field on it is presented as a naive label over a value, with
the label given more typographic weight than the value it labels — small, uppercase, and
widely letter-spaced. Nothing on the surface leads. A reader opening a contract to find out
who holds it and whether it is being paid meets six field tiles of equal emphasis, and the
loudest element on the screen is a solid red delete button they did not come to press.

**The screens around it disagree about their own dimensions.** The route wrappers declare
four different maximum widths across three different padding recipes, one of which reserves
a large trailing gap on a single screen and nowhere else. Nothing decides this; each screen
decided it separately.

## Goal

One shell owns everything a record surface has in common, and each concept supplies only
what its own record looks like. On that surface a record's identity leads and its
specification supports, rather than every field being given equal weight. The vocabulary
the shell establishes — one page frame, one border strategy, one set of spacing steps, one
action hierarchy — is the application's, not the record surface's alone.

## Constraints

- **Both locales, both directions.** Every surface here is bidirectional. A title area
  whose parts align by physical side, or a specification list whose columns are ordered
  left-to-right, is broken in Arabic.
- **One palette, no modes, and elevation is carried by value.** The stylesheet states this:
  background, card, popover, muted, secondary, accent, each step lighter reading as more
  raised. This is the repository's answer to *Use fewer borders*, and it is the answer that
  applies — the book's own advice is to reach for a shadow, and a shadow reads as almost
  nothing on a near-black ground. So a border comes out where the value step already
  separates; no shadow ladder is introduced.
- **The reference is silent on most of what this touches.** _Refactoring UI_ has nothing to
  say about bidirectional layout, dark interfaces, motion, focus, or text that changes
  length between locales. Where it is silent this repository's own standards are the only
  authority, and they are not argued with.
- **Reading surfaces take their concept's shape.** A read surface is the concept's own to
  present ([[rules/interface]], under *Surface kinds*). The
  shell may own mechanism and chrome; what a record's body looks like stays with the module
  that owns the record.
- **A contract's status is derived and a terminated contract is locked.** The surface reads
  what the domain decides and never restates the rule — a control the domain would refuse
  is not offered.
- **No new dependency and no motion library.** Motion responds to something or does not
  exist, and reduced motion is gated rather than assumed.

## Architecture

**The record surface becomes a shell in the design module, and every concept's record
component becomes a body for it.** This is the shape the list already has: one block owns
the query state, the search, virtualization, the empty state and the create action, and the
module that owns the data supplies a snippet saying what one record looks like. The record
surface is that same division one layer up, and it is recorded as
[[rules/interface]], under *Record surface*
because a reader who knows ADR 0020 will otherwise read it as a contradiction.

What crosses into the shell: the page frame, the loading state, the not-found state, the
back control, the action cluster and its hierarchy, the title area, the record's fields
directly beneath it, and choosing between the record's collections — together with keeping
that choice in the address where there is a choice to keep. Four concepts currently carry an
identical pair of effects to hold a section and the address in step; that is mechanism, and
it stops being written per concept.

What stays with the concept: what the title area says, what the record's fields are and how
each is read, which collections it has, and which actions it offers.

**The record's own fields are not one of its sections.** Every surface put them behind an
*Information* tab beside its collections, and the shape of the five is the same throughout:
one information tab, plus contracts, or units, or payments. Four of the five records have
exactly **one** collection, so the switcher was choosing between the record and the single
list attached to it — the reader opened a tenant and pressed a tab to see the tenant. So the
fields read under the title area always, and a section is a collection. Four records show
one collection under its own heading with no control at all; the payment record shows none;
the contract alone has two and gets the switcher. *Separate visual hierarchy from document
hierarchy* (50 / 54) is the reference's line on this: the record is the document, and a tab
strip was giving it the same rank as a list hanging off it.

**A chosen section reaches the address only where a switcher exists.** Four concepts write
`?section=` today and two read it back, so the tenant and the unit have been pushing a query
string nothing consumes. The parameter survives on the contract, and the existing
`/contracts/units/<id>` route keeps working by choosing a collection rather than a tab.

**The specification stays one column, and the vertical cost is paid rather than dodged.**
With the fields always on screen they sit above the collection rather than instead of it, so
a six-field contract pushes its ledger down the window. Wrapping into two label-and-value
column pairs would recover the height and was rejected: with one row gap between every
column the space separating a value from the *next* pair's label equals the space separating
a label from its own value, which is precisely the failure *Avoid ambiguous spacing* (90 /
96) names. Six rows at the spacing scale's third step is under two hundred pixels, and that
is affordable; where it stops being affordable the answer is fewer fields on the record, not
a denser grid or a control that folds the record away.

**A field stops being a tile, and the header stops being a panel.** Four treatments were
built on real contract data and looked at
([[efforts/record-surface-and-visual-vocabulary/evidence/prototypes/the-record-surface-treatment]]);
every one that dropped the filled `bg-muted` slab beat the one that kept it, so the panel was
the fault rather than the list inside it. The title now leads on the page background, with the
action cluster on its line and the eyebrow and status beneath it.

**The fields read as aligned rows.** A fixed label column, values aligned down the page, one
hairline between rows and no boxes. The label carries less contrast than the value and the same
size — *Labels are a last resort* (PDF 44 / book 48) read against a dark palette, where the
section's own instruction of a darker label and a lighter value inverts and the book says
nothing about dark interfaces; what survives the inversion is that the two are told apart by
contrast alone, so the label stops shouting in tracked capitals and the datum is the brighter.
The record's identifying data still moves into the title area unlabelled, because format and
context already identify a name, a period or a status.

**The hairline is the one separation kept.** An unruled list at this row height reads as loose
text rather than as a specification, and *Use fewer borders* (224 / 238) argues for removing the
border where a fill or a colour step already separates — here nothing else does, so one rule per
row is the least that still groups. The tiles used a border *and* a fill for that job.

**The prototype found one thing prose could not.** A contract's government identifier is a
UUID, and the compact treatments truncated it — a field a reader opens the record to read. The
treatment chosen is the one that shows every value whole.

**The nesting of bordered, filled boxes collapses.** A record currently sits inside a page
frame, inside a header panel with a border and a raised background, beside a card with a
border, holding tiles with a border and a raised background — four separations for two
groupings. All four go: the record sits on the page background, and the only separation left
anywhere on it is the hairline between one field row and the next.

**Spacing comes from a stated subset of the utility scale rather than from the whole of
it.** The reference asks that no two adjacent steps be closer than about a quarter, and the
scale in use is linear at the small end where the difference matters most. The subset is
named in the frontend standard and enforced by review; no second vocabulary of spacing
tokens is introduced beside the framework's.

**A destructive action stops being the loudest thing on a reading surface.** Every record
surface currently offers delete as a solid, high-contrast control, and two of them offer
terminate the same way. *Semantics are secondary* (56 / 60) puts the destructive action at
secondary or tertiary on the page and makes it primary inside the confirmation step. The
confirmation step already exists as the shared dialog, and it already styles its confirming
control that way, so this is a downgrade on the page and no change at the point of
decision. The controls stay buttons rather than moving into a menu, because they are placed
where tabbing already reaches them.

**One page frame.** The shell owns the record routes' width and padding, and the remaining
screens adopt the same frame rather than each declaring one. *Grids are overrated* (78 / 84)
argues for a maximum width chosen for the content — which is what this is, chosen once
instead of five times.

## Approach

The shell and the first concept on it land together, because a shell with no caller cannot
be looked at and a vocabulary stated in prose cannot be judged. The tenant record goes
first: it has two fields and one collection, so what is being looked at is the shape rather
than the content.

The three remaining record migrations gate none of each other and can be built in any
order. The contract record is the hardest — a derived status, terminate and restore, a
duplicate that clears the unique field, six fields over a ledger, and two collections, one of
which writes — so it goes last, when the shell has been exercised by two easier cases and is
known to fit. It is also the only record that keeps a switcher, so it is the only place the
switcher's own weight has to be settled.

The application-wide pass follows the shell rather than preceding it. Doing it first would
mean fixing the borders and the frame inside five components that are about to be replaced.

**The look is specified here in prose and corrected while building, at the user's
direction.** The scope assessment gated this work on evidence, and the user overrode the
gate. The correction point is not left to chance: the first ticket declares an increment at
the moment the tenant record first renders on the shell, which is the earliest the
specification list can be judged against the tiles it replaces.

**That increment was reached, and it is what produced the section model above.** The tenant
record was built on the shell and looked at beside an unmigrated contract record. The
specification list was not the finding: with the tiles and the solid destructive control gone,
the loudest element left on the surface was the filled tab strip, and the reason it read wrong
is that it was offering a choice between the record and its one list. The list treatment
stands; the sections did not. The increment is **resolved** — the fields keep their labels and
lose their grouping, and the question of how a six-field record reads is deferred to the
contract, which is the first surface where a specification list is genuinely a list.

**Considered and rejected — stacking every section down one scrolling page.** The most literal
reading of *sections rather than tabs*, and the one the phrase usually means. Rejected on a
mechanism rather than a taste: every collection is a virtualized list measuring against a
viewport with a bounded height, and stacking removes the bound. Each list would need an
arbitrary fixed height inside a scrolling page — nested scroll regions on a desktop window,
and the case the interface performance measurement already covers. De-virtualizing is not
available either: [[rules/data]], under *List reads*, loads whole
result sets, and the tenant directory is five figures.

**Considered and rejected — keeping the switcher and quieting it.** Restyle the filled pill
bar as a quiet underlined nav. It is the smallest possible change and it fixes the contrast
complaint exactly. Rejected because the contrast was the symptom: a two-item switcher between
a tenant and that tenant's contracts is wrong at any weight, and quieting it would have made
the wrongness harder to notice rather than absent.

**Considered and rejected — a section per route.** `/tenants/<id>/contracts` as a screen of
its own. Honest addresses, lists keep their height, and no switcher state exists to hold.
Rejected for its blast radius: it multiplies routes across four concepts and reworks the back
trail, which is ADR-backed behaviour this effort has no reason to open.

**Considered and rejected — one component rendering every record from a declaration.**
Maximum consistency, no duplication at all. Rejected for the reason the list block was:
the configuration grows to cover what markup says directly, and the contract record — with
a status, two lifecycle actions, a ledger and a unit transfer — is where that shape breaks
first.

**Considered and rejected — shared pieces with five surfaces still assembling them.** A
field cell, a header block and a shared not-found state, composed by each concept. It
honours ADR 0020 most literally and unpicks the least. Rejected because keeping five
assemblies identical stops being structural and becomes discipline, which is the failure
[[rules/interface]], under *List presentation*, named when it rejected
the same option for lists.

**Considered and rejected — folding labels into values everywhere.** The reference's
default position, and the strongest hierarchy available. Rejected on two counts: a national
identity document and a contract's government identifier are both digit strings and cannot
be told apart by format, so dropping their labels loses information; and folded phrasing has
to be authored per locale and does not survive translation into Arabic as one unit.

**Considered and rejected — keeping the tiles and only fixing their hierarchy.** Removing
the border, stopping the label from shouting, and letting the value carry weight. It is
most of the visual gain for a fraction of the work. Rejected because it leaves every field
at equal emphasis, which is the finding rather than a symptom of it.

**Considered and rejected — semantic spacing tokens in the stylesheet.** Machine-enforced
rather than review-enforced. Rejected because it puts a second spacing vocabulary beside
the framework's own, so every component then reads in a dialect, and the stylesheet is
deliberately kept to what is genuinely global.

## Acceptance criteria

- Every record in the application — contract, tenant, complex, unit, payment — opens on a
  surface with the same loading state, the same not-found state, the same back control, the
  same action cluster and the same title area.
- A record that cannot be found offers a way back to where the reader came from.
- No record surface presents a field as a bordered, filled tile; a record's identifying data
  is read in its title area without labels, and its remaining fields read as a labelled
  specification list.
- On any record surface, the delete control is not the highest-contrast element on the
  screen, and the confirmation it opens still presents its destructive action as the primary
  one.
- Every screen in the application uses the same maximum width and the same page padding.
- On every record, the record's own fields are visible without choosing anything.
- A record with one collection shows it under its own heading and offers no switcher; the
  payment record, which has none, shows neither.
- On the contract — the only record with two collections — choosing one puts it in the
  address, and opening that address returns to it. `/contracts/units/<id>` still opens on
  units.
- No record writes a section into the address that nothing reads back.
- Every record surface reads correctly in Arabic and in English, in both directions.

## Risks

- **The specification list reads worse than the tiles it replaced.** Settled by prototype on
  the contract's six real fields, which is the case that discriminates. What survives is
  narrower: on the tenant record the list is a **single row**, where the hairline has nothing to
  separate it from and may read as an unfinished rule rather than as rhythm. Detected on the
  first surface built; the answer if it reads wrong is no rule below a lone row, not a return to
  the tiles.

- **The fields and the collection compete for one window.** The specification is now always on
  screen above the list rather than instead of it, and the contract has six fields over a
  ledger. Detected by opening the contract record at the smallest window the shell supports;
  the answer is the column wrap, and if that is not enough, fewer fields rather than a
  collapsing control — a record that has to be unfolded to be read is the tab in another
  costume.
- **The shell fits four records and not the fifth.** The contract record is the one that
  would break it, which is why it is built last rather than first. Detected when its
  sections, its two lifecycle actions and its duplicate are fitted; the answer if it does not
  fit is a wider seam for the action cluster, not a second shell.
- **A migration silently drops a field.** Five surfaces are being rewritten, and a field
  that quietly disappears is invisible in a diff that replaces whole markup blocks. Detected
  by reading each record's copied details against the surface before and after — the copy
  action states every field the surface shows, so the two are comparable.
- **Removing borders flattens surfaces that were relying on them.** The value steps between
  background, card and muted are small at the dark end of the palette. Detected by looking
  at each surface after the border comes out; the answer is a further value step, not a
  border back.
- **The page frame change reaches every route at once.** A single width applied everywhere
  will be wrong for at least one screen. Detected by opening each; the answer is that screen
  stating its own width deliberately, which is different from four screens each having
  guessed.

## Out of scope

- **The list and directory surfaces.** Their presentation is per concept and recently
  decided; they receive the border, frame and action-hierarchy changes and nothing else.
- **The landing screen's content.** Its shape was settled separately and is not reopened.
- **The form surface.** Writing surfaces already converge on one component; only the shared
  vocabulary reaches them.
- **The colour palette.** One dark palette, unchanged. The reference's colour chapters
  assume a light ground and say so.
- **Search cost, reconcile cost, and the unbounded tenant read.** Measured and recorded
  separately; nothing here makes them better or worse.
- **The blurred-surface criterion recorded against the overhaul.** It is contradicted by the
  interface performance measurement and is the overhaul's to resolve, not this effort's.

## Ticket set

**Root** — [#211](https://github.com/saud-alnasser/rentable/issues/211), the overhaul's map
issue, at the user's instruction. This run cuts no root of its own: the record surface is
part of the overhaul, so it hangs where the overhaul does — as the first feedback pass did.

| # | Issue | Title | Tier | Blocked by |
| --- | --- | --- | --- | --- |
| 01 | [#390](https://github.com/saud-alnasser/rentable/issues/390) | `feat(design): a record surface is one shell, and the tenant record is the first on it` | Standard — carries ADR 0032 and one declared increment | — |
| 02 | [#391](https://github.com/saud-alnasser/rentable/issues/391) | `refactor(complex): the complex and its units read on the record surface` | Express | 01 |
| 03 | [#392](https://github.com/saud-alnasser/rentable/issues/392) | `refactor(payment): the payment record reads on the record surface` | Express | 01 |
| 04 | [#393](https://github.com/saud-alnasser/rentable/issues/393) | `refactor(contract): the contract record reads on the record surface` | Standard | 01 |
| 05 | [#394](https://github.com/saud-alnasser/rentable/issues/394) | `refactor(design): every screen takes one page frame and loses the borders the value step already makes` | Standard | 01 |
| 06 | [#395](https://github.com/saud-alnasser/rentable/issues/395) | `refactor(design): a destructive action is secondary until its confirmation` | Express | — |

Ticket 01's declared increment — *after the tenant record first renders on the shell — does
the specification list read as designed, or do the fields need their grouping back?*, type
`prototype` — has been **reached and resolved**. It was reached mid-build, the surface was
looked at, and it returned the section model recorded above rather than a verdict on the
list. No ticket carries an increment now; 01 resumes on the amended acceptance criteria.

**The re-plan adds no tickets and retires none.** Every ticket in the set still describes work
that has to happen and still divides where it divided; what changed is what *done* means for
01 through 04, which is an edit to their acceptance criteria rather than a different set. The
loud switcher needs no ticket of its own either — it survives on the contract alone, so it is
04's, where that record is built.

Tickets 02, 03 and 04 gate none of each other. Ticket 06 gates nothing and is gated by
nothing; it is listed last because it is the smallest, not because it comes last.
