---
status: implemented
---

# refactor(design): what a record shows, what a row counts, and how a screen asks

## Problem

A pass of interface feedback on the overhaul, arriving in one conversation. It divides into
three groups, and the third is the one with teeth.

**Three records say the wrong thing, or say it twice.** The tenant record puts its phone number
in the unlabelled title area and its national identity number in the labelled list below — but
those are two digit strings, and *Labels are a last resort* (48) carves out exactly that case:
*"Sometimes you really do need a label; for example when you're displaying multiple pieces of
similar data and they need to be easily scannable."* Read against the rule it cites, the
arrangement is inverted. The unit record states its status twice, from one value. The complex
record's field list holds one entry — how many units — which is less than the record knows.

**Two directory rows are flat where a third is not.** The contracts row carries a status glyph
and a payment ring; the tenants and complexes rows carry grey counts, so they read as
unfinished beside it. The complexes row counts units and vacancies and never says how many are
occupied, which is the figure an operator scans for.

**Three screens make a decision harder than it is.** The workspace-conflict screen prints the
same title and description twice — once on the outer surface, once inside the conflict card,
both from the same table. Its three actions crowd one row, and two of them differ only by which
side's copy is destroyed. The confirmation dialog every record's delete opens has never been
designed as a whole. And the complex form asks for a building's units one name at a time
through a text field and a plus button, which is the wrong instrument for a building with
eighteen of them.

One smaller thing rides along: the export control is drawn as a download arrow on an
application with no server, where nothing is downloaded and a file is written to disk.

## Goal

A record's data is labelled where the reader scans for the label and unlabelled where format
and context already answer, stated once. A row's figures carry the state they count. A screen
asking an irreversible question puts the choice on the things being chosen between, and names
what it is about exactly once.

## Constraints

- **Both locales, both directions.** Every surface here is bidirectional; the complexes row
  grows by a figure and the conflict screen changes shape, and neither mirrors for free.
- **The tone vocabulary is already declared** in the status cell — primary is running,
  destructive is failed, muted is settled or not started. This work extends it from statuses to
  counts and introduces no second one.
- **Occupancy is derivable.** A unit is `occupied` or `vacant`, so occupied is the unit count
  less the vacant count, both already on the list query.
- **A list narrows in SQL** ([[rules/data]], under *List reads*), so
  counting a complex's contracts needs the scope in the query.
- **The evidence for an irreversible choice may not be hover-only.** The conflict panel states
  this about itself and it binds the redesign: whichever copy is being destroyed has to be
  readable without a pointer.
- **A form's presentation follows how much form there is**, not preference — `FormSurface`
  already offers a centred panel and an edge sheet on that rule, and the complex form moves
  between them only because its content grows.

## Architecture

**The count cell gains a tone.** `design/cell/count.svelte` hard-codes muted; it takes the tone
from its caller instead, so a row decides what its own figure means without a second count
component existing. The figure, the accessible name and the tooltip do not move.

**The contract list learns one more scope.** `contract.getMany` narrows by `tenantId` and by
`unitId`, the second through an exists-subquery over the assignment table so a contract holding
several units stays one row. A complex scope is the same shape one join further out, and it is
the only change here outside the interface.

**The conflict screen stops being two nested cards that both introduce themselves.** The outer
standalone surface keeps the startup question it already has; the conflict's own title and
description belong to the panel, which is where the answer is. The panel's two side chips stop
being read-only evidence and become the choice — a copy is selected, then one labelled control
acts on the selection, which is *Think outside the box* (242) read literally: a radio group may
be selectable cards. Cancel loses its label because cancel destroys nothing.

**The complex form grows a unit-building surface and becomes an edge sheet as a consequence.**
The unit list is the form's own state rather than a schema field, and that stays true; what
changes is the instrument for filling it. A prefix and a range expand into named units — the
names are what is held, so every one stays individually editable and removable after expansion,
and the range is a way of typing rather than a thing the complex remembers. The duplicate rule
the procedure enforces over the arriving set is answered against the expansion as it is now
answered against a single name.

**The confirmation dialog is rebuilt rather than adjusted**, and it is one shared block, so
every record's delete and the contract's terminate move together.

**A leftover goes.** `complex/component/unit-count.svelte` renders one asynchronous cell for a
table that no longer renders anything — it carries a `DataTableAsyncCellProps` type and a
hard-coded size its only caller overrides. The complex's new field list has no use for it.

## Approach

**The row treatment goes first**, because it is the only part settled by evidence and the
vocabulary it establishes is what the rest is read against.

**The colour rule was prototyped, and the prototype overturned the reasoning behind it**
([[efforts/records-rows-and-decisions/evidence/prototypes/directory-row-colour]]). Three variants ran on
the real lists: no colour, the live state tinted, the exception lifted by contrast. A read-only
probe said the tint would light 29 of 29 complex rows, which looked like the argument against
it. It won anyway, and the write-up records why the objection was wrong: a tint on one figure
inside a three-figure cluster is not a per-row flag, and the reasoning had substituted the
second for the first. The same session settled the unit total's glyph — beside a solid disc and
a dashed ring a door is a thing next to two states, where the layout grid shares the register.

**The dialog is gated on its own prototype, declared on its ticket** rather than run now. The
question — what a confirmation should look like when it is asked from five surfaces and
sometimes cannot be granted at all — only becomes answerable once one is built and seen in the
blocked case, which is the case that shapes it.

**Considered and rejected — icon-only conflict actions.** What was asked for, and it would have
made the row shortest. Rejected because "keep local & link" and "use remote & link" differ by
which side's data is destroyed, and two glyphs distinguished only on hover put an unrecoverable
choice behind a pointer. The selectable-copies shape gets the same row back without that.

**Considered and rejected — an occupancy ring on the complexes row**, mirroring the contracts
row's payment ring. Closest visual echo, rejected before building: it is an arc rather than an
icon, and the tenants row has no denominator, so it would give two rows different vocabularies
for one complaint.

**Considered and rejected — one colour rule per list.** The tint's density inverts between
them. Dropped because the rarity on the tenant list is the single rule behaving correctly — a
tenant holding a running contract is the exception worth spotting.

**Considered and rejected — repeating the location in the complex's field list.** It is already
read in the title area, and repeating it is the duplication the unit record is being fixed for.

**Considered and rejected — a multi-line field for unit names, pasted or typed.** It needs no
pattern language and handles a building whose units are not a sequence. Rejected because the
common case here is a sequence, and a text area makes the operator type what the application
can generate; the range keeps the names as the truth, so a building that does not follow a
pattern is still served by editing them afterwards. Rejected too — a range writing *into* a
text area, so the pattern is a shortcut and the text the record. It is the most capable shape
and the most to get wrong, and nothing in the feedback asked for it.

**The export glyph is a correctness point rather than taste.** A download arrow describes
fetching from somewhere remote, and this application has no server: the control writes a file
to disk and reveals it in the file manager. A table with an arrow leaving it says what the
control does — this list, out — where a file glyph would describe the result and a download
arrow describes something that never happens here.

## Acceptance criteria

- On the tenants and complexes directories, a count standing for something running carries the
  primary tone above zero and the muted tone at zero, and no other figure changes tone.
- The complexes row states how many units, how many are occupied and how many are vacant, and
  the unit total is not drawn as a door.
- The tenant record reads its national identity number and its phone number as two labelled
  fields, in that order, and states neither in its title area.
- The complex record's field list states its unit total, its occupied and vacant counts, and
  how many contracts run against its units today.
- A contract list can be narrowed to one complex without loading another complex's contracts.
- The unit record states its status exactly once.
- The workspace-conflict screen states the conflict's title and description exactly once.
- On that screen the copy being kept is chosen by selecting it, the control that acts says in
  words which copy it keeps, and no control that destroys a copy is identified by glyph alone.
- A complex is created through an edge sheet, and a building of eighteen units is described in
  one entry rather than eighteen.
- Every unit produced by a range is still editable and removable on its own afterwards, and a
  range naming a unit twice is refused before the complex is submitted.
- The export control is drawn as a table leaving, not as a download arrow.
- Every surface above reads correctly in Arabic and English, in both directions, and every
  control still names itself to assistive technology.

## Risks

- **Three count clusters and a name compete for one row at the smallest window.** Detected at
  the floor window size; the answer is dropping the unit total, since occupied and vacant sum
  to it.
- **The primary tone on nearly every complexes row reads as noise at scale.** The prototype
  judged 29 rows. Detected the first time a much longer list is seen; the answer is the
  exception-lifted variant, rebuildable from the write-up.
- **The tenant and unit records are left with only an eyebrow and a name above their fields.**
  Detected by reading them beside a complex record, which keeps its location there.
- **Making the conflict's copies selectable adds a state where there was none**, and the screen
  is reached at startup before anything else works. Detected by opening it with each of the four
  conflict kinds, including the one that offers no remote copy to select.
- **The rebuilt dialog is worse than the one it replaces.** It is shared by five surfaces, so a
  regression lands everywhere at once. Detected by the declared prototype, in the blocked case
  as well as the ordinary one.
- **The complex form's sheet is a heavier presentation for a form that is still two fields when
  editing.** Detected by opening it on an existing complex; the answer is that the weight
  follows the create case and edit keeps the panel.

## Out of scope

- **The action control's copied class string.** Ticketed as #403, untouched here.
- **The other three directory rows.** Contracts, payments and units keep their treatment; the
  prototype mounted two and asked nothing about the rest.
- **`tenant.getMany`'s unbounded read.** Named in the interface performance baseline and still
  waiting; no path here touches it.
- **The conflict panel's second host.** The settings screen renders the same panel; this work
  changes the panel, so settings inherits it, but the settings screen's own layout is not
  redesigned.

## Ticket set

Nine tickets. Only 04 gates anything, and nothing gates it.

**Root** — #211, the overhaul's map issue. This run cuts no root of its own: the feedback is
about the overhaul, and the first pass of it hangs there on the same reasoning.

| # | Issue | Title | Tier |
| --- | --- | --- | --- |
| 01 | [#404](https://github.com/saud-alnasser/rentable/issues/404) | `refactor(design): a directory row's figures carry the state they count` | Express |
| 02 | [#405](https://github.com/saud-alnasser/rentable/issues/405) | `refactor(tenant): a tenant's two identifiers read as a labelled pair` | Express |
| 03 | [#406](https://github.com/saud-alnasser/rentable/issues/406) | `fix(design): a unit states its status once` | Express |
| 04 | [#407](https://github.com/saud-alnasser/rentable/issues/407) | `feat(complex): a complex record's fields say more than how many units` | Standard |
| 05 | [#408](https://github.com/saud-alnasser/rentable/issues/408) | `fix(sync): a diverged workspace states its question once` | Express |
| 06 | [#409](https://github.com/saud-alnasser/rentable/issues/409) | `refactor(sync): a workspace copy is chosen on the copy itself` | Standard |
| 07 | [#410](https://github.com/saud-alnasser/rentable/issues/410) | `feat(complex): a complex is built in a sheet, and its units with it` | Standard |
| 08 | [#411](https://github.com/saud-alnasser/rentable/issues/411) | `refactor(design): the confirmation dialog, rebuilt` | Standard |
| 09 | [#412](https://github.com/saud-alnasser/rentable/issues/412) | `refactor(design): the export control is not a download` | Express |

05 is listed before 06 because it removes a duplicate 06 would otherwise have to preserve, but
it is not a gate: either can land first.

**08 carries a declared increment** — *after the rebuilt dialog first renders on a record's
delete: does it read as designed in the blocked case, where nothing destructive may be
offered?*, type `prototype`. No other ticket carries one, and no ticket carries a fan-out: each
is one surface and would cost more to split than to build.
