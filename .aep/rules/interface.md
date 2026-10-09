---
paths:
  - apps/desktop/src/lib/**/component/**
  - apps/desktop/src/lib/design/block/**
  - apps/desktop/src/lib/design/cell/**
  - apps/desktop/src/lib/dashboard/**
  - apps/desktop/src/lib/contract/**
  - apps/desktop/src/lib/payment/component/**
  - apps/desktop/src/routes/**
  - apps/desktop/src/app.css
  - packages/design/src/lib/block/**
  - packages/design/src/lib/primitive/**
  - packages/design/src/lib/tokens.css
use-when: "a surface is being placed, built, or restyled — a screen, a block, a list row, a form, or a cell"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a surface is read and costs nothing
  otherwise.

  Merged 2026-08-17 from fourteen single-decision rules, each of which was one
  converted ADR: interface-design, surface-kinds, record-surface,
  record-card-actions, row-activation, list-presentation, form-surface,
  validation-errors, status-presentation, application-surfaces, landing-screen,
  unit-presentation, contract-unit-transfer, attention-rank. Nothing was dropped
  or reworded — each is a section below, under its former file's name, so a
  citation reads `[[rules/interface]], under *Row activation*`.
-->

# Interface

Every rule governing what a surface **is** and how it **presents**. How the code that
draws it is written is [[rules/frontend]]'s; what it reads and writes is
[[rules/data]]'s.

**A component is chosen by [[contexts/desktop/components]].** Before a surface draws a primitive, a
block or a cell to show data, show a status, take an action, choose a value, disclose detail,
interrupt or guide, that context is read and its decision table followed; a need it does not name
is raised rather than answered with a component chosen by habit. Where a section below names the
component for a case, the section wins and the context is corrected. *Added by ticket 22 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the human's word of
2026-10-02.*

## The catalogue of acts

**Each act a person repeats has one pattern, and its section is where that pattern is written.**
A surface follows it; a surface that departs from it says why in that section, as a stated
exception, and nowhere else.

| Act | Section |
| --- | --- |
| search | *Search* |
| filter | *Filter* |
| sort | *Sort* |
| create | *Create* |
| edit | *Edit* |
| delete and confirm | *Delete and confirm* |
| undo | *Undo* |
| row actions | *Row activation* |
| record actions | *Record card actions* |
| bulk selection | *Bulk selection* |
| export and import | *Export and import* |
| print | *Print* |
| going back | *Going back* |
| switching sections | *Switching sections* |
| empty | *Empty* |
| loading | *Loading* |
| error | *Error* |
| not found | *Empty*, under *Not found* |
| notifying | *Feedback* |

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

## Where a surface's shape comes from

### Surface kinds

**A surface's shape follows its kind, never its operation.**

A surface that **reads** a concept's records takes that concept's own shape; a surface that
**writes** them takes the shared form surface; a surface showing the **application's own state**
takes the shared one too. Create and edit are one surface because they write — not because they
are adjacent verbs.

*Why: dividing by operation multiplies surfaces that answer the same question, and leaves the
reader guessing which of three shapes a given verb will produce.*

Recorded originally as ADR 0020, *Surfaces diverge by kind, not by operation*.

### Application surfaces

**The application's own surfaces converge, on two shared surfaces, one for each kind of screen.**

- **The steps before the application take the way-in surface**,
  `packages/design/src/lib/block/way-in-surface.svelte`: the welcome, the first run's steps, the
  join's steps, the wall, the no-workspace screen, and the loading that follows the way in. It is
  the window's content area laid out as a setup pane, not a card: the mark, the title and one line
  under it, the step's controls, and its actions, in one column placed from the top, with back in
  the content area's top-start corner and the step's position, where it has one, drawn by
  `block/way-in-position.svelte` as a small line above the title. A change of step runs a view
  transition in the reading direction.
- **The application failing takes the standalone surface**,
  `packages/design/src/lib/block/standalone-surface.svelte`: failing to start, recovering an
  unfinished update, settings failing to load, and an unanticipated route error. It is a card, and
  the toned ones carry the band that says at a glance what kind of event this is.

A screen that is neither a step of the way in nor the application failing takes neither, and
this section is where the question of a third is answered.

- **A workspace that would not open stands inside the application, in place of the
  workspace**: the workspace-held screen, `startup/component/workspace-held.svelte`, in the page
  frame where the workspace's page would be, with the rail and the titlebar up around it at every
  address. The organization opened and only that workspace did not, so it is neither a step of
  the way in nor the application failing, and it takes neither surface. It has two kinds. **Held
  by its version** (`workspaceNewer`, `workspaceBehindReadOnlyByVersion`): the workspace's name
  under the update's glyph, the reason in one sentence and the update action as its `screen`.
  **Refused for any other reason** (a member yet to bring it up, a full disk under its copy, its
  floors unreadable): the name under an alert's glyph, the reason, and a try again in the update
  action's place, since updating is no way past it. Under either, a plain list of the session's
  other workspaces, each of which opens that one. *Answered by tickets 11 and 25 of
  [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 7, which the human amended on
  2026-10-07.*
- **An organization that cannot be opened needs no surface of its own.** The person goes back to
  the organization switcher on the wall, which is the way-in surface, and a short callout above
  that organization says why, carrying the update action as its `notice` where a newer rentable
  upgraded it (`organization/component/switcher.svelte`). The generic failure screen is never
  where a refusal lands.

*Why: these surfaces have no data of their own to take a shape from, so the reasoning that
makes the concept lists diverge does not reach them — what they have in common is the whole of
what they are. They converge on two rather than one because the way in is a sequence a person
walks and a failure is an event they are told about, and one block carrying both strained at the
seam: a welcome drawn as a failure card reads as nothing yet, and a failure drawn as a setup pane
reads as nothing wrong.*

Recorded originally as ADR 0015, *The application's own surfaces converge, where its concepts' surfaces diverge*.
*Narrowed on 2026-10-01 by
[[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]], requirement 1,
from one shared surface to two, at the human's choice of 2026-09-30.*

### Record surface

**A record surface is one shell with a per-concept body.**

The shell owns the chrome and the mechanism — the page frame, the back control, the action
cluster, the title area, and holding the chosen section in the address. **What a record's body
looks like stays with the module that owns the record.** A record's own fields are not one of
its sections.

*Why: the five hand-written record surfaces held a byte-identical loading state, not-found
state, and header arrangement — none of which is the shape of anybody's record.*

Recorded originally as ADR 0032, *A record surface is one shell with a per-concept body*.

**A workspace has a record page of its own, under the settings area it is listed in**:
`/settings/workspaces/<id>` (`organization/workspace/component/page.svelte`), on the same shell.
At the top, what its card says: its name, the *open on this machine* badge on the one open here,
and its fields with the card's glyphs (`block/specification.svelte`'s `icon`): how many hold it,
what the reader may do there, the day it was made. Its acts are the card's, refused as there, but
*members*, which is the page. Below, its one collection, who holds it, as a record directory
(`organization/workspace/component/holders.svelte`): the settings directories' tray
(`organization/component/directory-tray.svelte`), its heading in the settings card's manner, the
search narrowing by username or role, the count, the order by username or role, and last the plus
(`create/component/control.svelte`, *add members*); then the members in it as the members
directory's own cards (the member card at its tile height, in the record tiles' grid), *custom
here* at a card's foot where what the member may do there is tailored, the empty block where
nobody holds it, and the no-match block where the search finds nobody. The plus opens the add
sheet (`organization/workspace/component/add-sheet.svelte`, the edge panel), which the page mounts
since it holds who can be put in. It is **one checklist**: the shared search field at its top
(*Search*, *find a member to add*, holding the focus as the sheet opens and leaving `/` to the
page's tray), and under it every member not in the workspace, always shown with nothing to open,
narrowed in place by username. A row is the person as their card heads them (the disc, the
username, the role's badge) with a check at its trailing edge, an empty ring filled and ticked
once checked. Pressing a row, or Space on it, checks or unchecks it where it stands, so nothing
moves between lists; the rows are a listbox with `aria-multiselectable`, one row in the tab order,
the arrows, Home and End moving between them and the down arrow reaching them from the field. A
search that finds nobody says so with the way out that clears it, and a sheet with nobody left
to put in says so. The footer's one button counts what it adds (*add 1 member*, *add 3 members*,
in Arabic in its own plural forms) and cannot be pressed with none checked; it puts every one
checked in, in the list's order. Pressing a card
opens *edit permissions* on that member (its `href` is the page with the member named on it,
consumed on arrival as the members directory consumes its own). Each card's record menu holds
the acts on the member there (`declareHolderActs` in `organization/workspace/acts.ts`), and
only these: *edit permissions*, a sheet of this workspace's permissions alone
(`organization/workspace/component/permissions-sheet.svelte`, mounted by the workspace's host);
and *remove from workspace*, red and asked first (*Delete and confirm*). How each is refused is
*Members and access*, under *Form surface*. Back returns to the workspaces section, which the page names as
its fallback: the trail keys a screen by its path, so the settings area is one screen whichever
section was left, and where the fallback names the screen being returned to it says where on it
(`backTarget`). A workspace the reader holds no grant on is not found. *Added by ticket 49 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1 as revised
2026-10-03, at the human's word: "manage members in the workspaces the form looks bad the switch it
needs to be a better looking maybe a page details like how records have pages record and dicreocty
of members and at the top information". The switches became a search field and member cards by
ticket 50, at the human's word of 2026-10-03: "the details page of a workspace in the settings it
should have a record search bar or feild that you search for a member then add them to the
worksace and a grid of cards sohwen to existing members and have elipses as action for them
regarding the workspace". The field became the directory's tray with a plus opening the add
sheet, and the menu lost *open member* and turned *tailor access here* into *edit permissions*, by
ticket 51, at the human's walk of 2026-10-03: "in a workspace the details page it has a searchbar
filter,sort add button on the tray; then grid of cards like now; a card when clicked it opens the
edit permissions option sheet; and the eliapess show edit permissions and remove options only".*

### Landing screen

**The landing screen is a band of routed figures over one section of records per rank.**

**What may join it is a stated test: a figure routes somewhere, or a section holds rows.**
Anything that does neither does not belong on this screen.

*Why: a proportion written as a sentence reads worst as a sentence, and one long queue answers
*who do I chase* while leaving *how is the month going* to a strip nobody reads.*

Recorded originally as ADR 0030, *The landing screen is figures over sections, and a figure routes or a section holds rows*.

**A section may carry the control for the setting that defines it, and that section's header
stands with no rows.** The ending-soon section is the one: the window that decides which contracts
rank as ending soon is a quiet glyph at the end of its header (`dashboard/component/ending-soon.svelte`),
opening the number of days, applied in place with no save step. Where no contract falls in the
window the header is still drawn in the rank's own place, saying none end within it, with the same
control, so a window that catches nothing is widened where it would show; the section fills in place
when it does. It is the one header the stated test above admits without rows, because a setting with
its only home on a section that vanishes when the setting catches nothing is a setting that cannot
be reached. The command menu offers it as a place, `/?ending-soon`, which opens the control.

*Why: the window was a field in the settings area, two screens from the only rows it changes, and
every neighbour there applied at once while it asked for a save.* *Added by
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirements 6 and 7.*

**The band and the sections are one read, and no figure stands before it has answered.** They
load under one loading block, whose shape is the band's three cards over two sections, so no
figure is drawn as `0` while the read is on its way. A read that failed draws the failed state
(*Failed*, under *Empty*) in place of both, with *try again*, and the ending-soon header with it.
*Nothing to chase* is said only under a read that answered with no rank, since a read on its way
or one that failed does not know whether there is anything to chase.

**A figure the reader may not view is left out, never drawn as `0`.** The read leaves out each
figure whose kind the reader may not view (effort 838, requirement 10), and the band leaves it out
with it: a card with nothing the reader may see is not drawn, and the money ring is drawn only where
both what was due and what was collected are known. Where collected is left out, what was due
heads the money card as *expected*. A reader who may not view contracts is answered no ranks, and
a list they were not allowed to read is not one with nothing in it, so nothing is drawn from it:
no outstanding figure, no section, no ending-soon header and not *nothing to chase*. *Ticket 05 of
[[efforts/861-the-app-never-shows-something-false/spec]], requirement 2.*

### Settings section

**A settings section is one column of cards, and everything in it is one.** Each tab of the
settings area draws its content in `packages/design/src/lib/block/settings-grid.svelte`: its cards
one under the next in a single column at every width, in every tab, the content capped near 1100
pixels. No two-column grid, no card spanning or standing beside another, no masonry: reading order
is source order, so what a keyboard and a screen reader meet is what the eye sees.

**A card has one anatomy** (`block/settings-group.svelte`): a header inside the card with its glyph,
its title, one muted line saying what it is for, and at its end an optional value (a count, a
state, a badge), never an act, and after the value an optional **header action** (`action`): the
card's one act on the card as a whole, a quiet text button at the header's trailing edge (the start
edge in Arabic), words with no glyph. The password card is its header alone, its *change* there; the
machines card's header carries *sign out others*, red words since it ends something, confirmed and
naming the machines it ends, refused with its reason where no other machine is signed in. Then its
rows (`block/settings-row.svelte`), the
meta line under a row's name and a badge beside it where one marks the row; then, after a
separator, the acts that end something, the error tone on the act's button alone, never on the
row's glyph or name, the card's edge or a band (an ending act on one row of a growing list, such as one machine's sign-out, is an
entry in that row's record menu instead, confirmed and in the menu's default tone, so the card's
red stays on one act, as revoking one of the organization tab's links waiting to be opened is (effort
851): this machine's own sign-out is such an entry in its row's menu, the one
that asks nothing (*Delete and confirm*), and the account has no card for this machine); then an optional footer of one note, one progress bar or one act. Every card takes the column's
width, and those that end something are written last. The roles, members and workspaces
directories are not boxed: their heading takes the card's header, the tray sits under it, the
record cards follow, so no box sits in a box. A notice waiting on the reader, the ownership offer,
is a callout in the column rather than a card of one row. A row's control whose words a tooltip
can carry is an icon control named by one (the log folder's reveal, the check for updates, sync);
the way forward and every act that ends something keep their words, save the one that sits on a
picture (below). **No button repeats the glyph
its row or its card already shows**, in any tab: a row's control is words alone, or an icon alone
named by a tooltip, and never the row's own glyph again, since the glyph already said what the row
is about (a row whose control must keep a glyph leads with another, as the available version's
`package-plus` beside the install's `download`). Every act in a card's end is red words with no
glyph. The organization's leaving card holds, for an owner, the Turso account: one row stating
its connection on this machine (connected, or not held here with *reconnect* in words), then the
acts, *transfer ownership* (its button *transfer*, refused with its reason where nobody can take
it), *forget Turso account* (confirmed, naming where the token is revoked), *disconnect this
machine*, and *delete organization* last and set apart; a member meets the disconnect alone. There
is no Turso account card. The disconnect forgets this organization alone and leaves any other the
machine holds; the wall's switcher reaches the same act, confirmed the same way, for any held
organization, and the organization tab opens on the name card, whose edit the owner alone sees
(effort 851). A choice explains itself, with no
sentence under it; where one segment's effect is not in its word (appearance's *system*), that
segment alone says it in a tooltip. A value not yet known is not drawn, never a word standing in
for one (the available version before a check). An icon control may show what it is doing with its
own glyph and nothing else: the check for updates turns its glyph while a check runs, `aria-busy`
for as long, and stops when it answers, and sync turns its glyph the same way while a run is in
flight, whoever started it, the state row's own glyph (`cloud-sync` while syncing) standing still;
the log folder's reveal crosses from a closed folder to an
open one when pressed and closes again. Both move on the motion tokens and hold still for a reader
who asked for less motion ([[rules/frontend]], *Motion*), the state still changing. A
picture the reader may change is itself the control that changes it, as a profile picture is: the
organization stamp's preview is a button named *replace image* (*choose image* while empty), with
no button beside it; a reader who may not change it sees a picture. Removing such a picture sits on
the picture, not in a row of its own: a small icon button inside the preview's top trailing corner,
the preview's sibling rather than inside it, red on the button alone, named *remove organization
stamp* by its label and its tooltip, confirmed, and absent while there is no picture to remove. It
and the replace glyph inside the bottom trailing corner are one pair, drawn as the same small disc
and always shown, never hanging past the picture's edge. The picture sits at the card header's
trailing edge, in its action slot beside the title and the card's one line, top-aligned with them
and mirrored in Arabic, for a reader who may change it and one who may not alike. The card then
has no rows at all.

**Detail few readers need folds under its row, and nothing else folds.** A row's `details` is an
expander on the `collapsible` primitive, in the manner of Fluent's settings expander: the glyph,
the name, the value and the control stay in view, a chevron after them opens the detail beneath,
labelled by what it opens, one level only, closed by default and remembered while the application
runs. Three rows take it: the available version's release notes, the sync state's machine detail (the workspace this machine keeps and where its copy is), and the
Turso account row's database and organization, in the leaving card. **Never folded**: a status word or its problem's
callout, the last time Turso was reached, a download in progress, the ownership offer, the machines
list, the earlier-records callout, the log folder's path (a line of facts with room to stand whole),
and every act in a card's end, which `settings-row` refuses to
fold whatever it is handed. A new fold passes the same test: most readers do not need it, it
reports no condition, it ends nothing, and the row's header still says what matters.

*Why: the human found the settings a linear column of sentences and asked for "cards and section
of grids", then for everything in a tab to be a card, and then why the collapsible primitive went
unused. Walking the built two-column grid, they asked for "each card is under the next card" and
for "only the action button" to be red. Then they found "odd using the same icon of the sectio
ntitle and descripto in the action button", asked for *transfer ownership* with a red *transfer*
and red text disconnect and delete, asked that the sync button be "the icon only with tooltip",
and, finding the Turso account card said what disconnect says, chose to "Fold it into Leaving". Of the stamp's remove row they asked that it "needs to be
integrated in into the part of the image not a separate thing", named the organization stamp.
Of the account they asked for the password's act as "a text simple milimst on the right side of
the card", that the machines and this machine be merged with "simpley an otpoin to login out of
the mecahine", and found signing out of all "od to be a complete section".
Every settings pane the research saw is one column. Every
disclosure guideline read (Apple's disclosure controls, GOV.UK's details, Microsoft's settings
expander, Android's advanced settings) agrees on the fold's test.* *Added by
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1 as widened on
2026-10-02, ticket 21, revised the same day, tickets 31, 34, 36 and 38, and on 2026-10-03, ticket 46; evidence in its
`evidence/research/settings-*-as-cards.md` and `how-production-apps-organize-a-settings-section.md`.*

## Tone

**What a surface reports, it reports in one vocabulary: `neutral | info | success | warning | error`.**

Stated once, in `packages/design/src/lib/tone.ts`. A callout, the standalone surface's band, a status badge, a
toast and a record action all report a kind of event, and every one of them takes its tone from
there. **A component never declares its own set of kind-names**, and a colour a tone lends always
resolves through a token in the product's token layer, `packages/design/src/lib/tokens.css`,
rather than through a raw palette entry.

**`neutral` is a tone, not the absence of one.** A surface that declares nothing reads identically
to one whose author never considered the question, and those two should not look the same in the
source either.

*Why: the application had six of these and no two agreed, so a callout, a badge and a toast
reporting the same event drew three different colours, and two of the callout's four could not be
changed from the place every other colour is changed from.*

**The line is what a thing reports, not how loud a control is, and not what a figure stands for.**
Two things sit outside this deliberately:

- **A control's emphasis.** A button's `destructive` and a menu item's `destructive` are shadcn's
  vocabulary, on files the CLI writes whole, and they stay. `--destructive` also stays as the token
  name under `error`: the vocabulary is what got a shared word, not every colour beneath it.
- **A domain vocabulary.** A count cell's `running | settled | money` and the status treatment's
  nine names report a *condition of the domain*, not a kind of event, which is why a count and a
  status glyph agree about what blue means and neither answers to `info`. `money` is not a state at
  all. Folding either into the five would put a figure counting money into a vocabulary that has
  nothing to say about it.

**Nothing gains a tone it has no caller for.** The record action control takes two of the five,
because no record action has ever been a success or a warning.

Settled by [[efforts/capabilities-only-one-surface-got/spec]], requirement 17.

## Lists and rows

### List presentation

**The list mechanism is shared and the presentation is per concept.**

One shell owns the query state, the search and its debounce, virtualization, the empty state,
the result count, and the create control (*Create*, below). The module that owns the data
supplies a snippet saying what one record looks like. The search field and the bar it sits in are
the shell's parts that other sets draw too (*Search*, below).

*Why: the five lists are not five of a kind — payments are an account statement, units an
occupancy board, contracts a triage queue, tenants and complexes directories searched rather
than browsed — and one uniform table fits none of them.*

Recorded originally as ADR 0013, *Each list gets the presentation its data is shaped like, over one shared shell*.

**A list may lay its records as tiles in a grid**, and the shell owns the grid as it owns the rest
of the geometry. A list turns it on by passing `recordMinWidth`, which for a grid of record cards
is `RECORD_TILE_MIN_WIDTH` (300 px) from `list/list.ts`; one width for every grid, so the
directories break at the same window widths. The shell fits as many columns as `columnsFor`
answers: tiles of at least that width with the gap between them counted, one where the window is
narrow, two where it is wider, and **never more than three**, since a fourth column makes each
record a strip again. Tiles are `gap-3` apart across a row, the same measure as down the list, and
the loading skeleton draws the same columns with the same gap. A selection box stands beside a
tile, level with its heading line, where a row has it at the row's middle. Keyboard movement runs
across a row and down the columns in both reading directions, and the rows stay virtualized.

A record in a grid wears `record-card.svelte` with `layout="tile"`: a column whose first line is
the `heading` snippet (the record's name and its status) with the actions control at its end, and
whose facts follow, one to a line. The link over the card and both routes to its acts are the
row's (*Record card actions*, below). A list that does not turn the grid on keeps the row layout,
one line, unchanged. *Added by ticket 14 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirements 18 and 19: the
shell and the card can draw the grid; each directory turns it on in its own ticket.*

**A tile's facts are `Cell.Fact` lines, and a tile's height is counted, not measured.** Every
fact on a tile is one `Cell.Fact` (`design/cell/fact.svelte`): a small dimmed glyph standing for
what the fact is, then the fact, muted and small, so no label is written beside a number. Each
line sets the same fixed leading, `factLeading`, 20 px in both locales, because the list lays its
tiles at the height a concept declares rather than measuring them, and a line left to inherit its
leading is near 22 px in Arabic and overlaps the tile below. A line added to a tile, or one drawn
without that leading, changes the concept's declared height too. The member tile is the one
exception, at the human's word of 2026-10-02: its facts are four short values side by side, the
case where a name is wanted to tell them apart, so each is a tinted field carrying its name small
above the value, every line still at the same fixed leading.

**The complexes, tenants, contracts, members and workspaces are grids; a complex's units are not.** Each tile is the
concept's own component, at the height its list declares:

- **A complex** (`complex/component/card.svelte`, `COMPLEX_TILE_HEIGHT`, 120 px): its name, its
  location, and at its foot how many units it holds, how many are occupied and how many vacant,
  each count with its word and left out at zero.
- **A tenant** (`tenant/component/card.svelte`, `TENANT_TILE_HEIGHT`, 144 px): the name as the
  one strong line, the national id and the phone as two facts held left to right, and at its foot
  what the tenant's contracts stand at: a chip for each status holding any (`Cell.StatusCount`,
  its glyph, figure and word in the status's tone), in the contracts directory's order, a status
  at zero left out, and *no contracts* where every count is zero. A reader who may not view
  contracts is told nothing of them.
- **A contract** (`contract/component/record.svelte`, `CONTRACT_TILE_HEIGHT`, 184 px, the same
  tile in the directory, a tenant's contracts and a unit's): the tenant with the status and its
  word on the heading line, then the reference, the dates as a range, and the names of its units
  in the reader's list style, each a fact; at its foot the ring with the paid and expected amounts
  beside it, the cost with its interval, and how many payments it holds, drawn only above zero.
  Where the reader may not view tenants the reference leads instead and is not repeated.
- **A member** (`organization/member/component/card.svelte`, `MEMBER_TILE_HEIGHT`, 228 px, in the
  settings' members directory): the avatar's initials, the username and the role badge on the
  heading line, then its facts as four fields in a grid two across, each a rounded tile in the
  muted token with no border, holding its glyph and its name small and muted over the value in
  the stronger weight: how many workspaces it holds (in words when none) and when it joined in the
  first row, whether the account has a password and whether a machine is signed in on it in the
  second, drawn once the standing has answered. No field takes a tone; a value saying nothing is
  there (*not yet*, *none*) is muted. At its foot, only where they apply, permissions of its own and
  an organization offered to it, each a small outline badge with its glyph.
- **A role** (`organization/role/component/card.svelte`, `ROLE_TILE_HEIGHT`, 196 px, in the
  settings' roles directory, in rank order): the `shield` glyph in its muted tile, the role's name
  and a badge counting who holds it (*nobody yet* when none), then four fields in the member
  card's look, two across: what it reads, what it changes, the people acts it holds, and the
  organization acts it holds, each as every one, a count of the whole, or *nothing* / *none*
  muted. It has no foot.
- **A workspace** (`organization/workspace/component/directory.svelte`, `WORKSPACE_TILE_HEIGHT`,
  196 px, in the settings' workspaces directory): the `building` glyph in its muted tile and the
  name on the heading line, an *open on this machine* badge beside it on the open one, then tinted
  fields two across: how many hold it, as a count in words (*nobody* when none, muted) with no
  initials drawn, beside what the reader may do there, and under them, across both columns, the
  day it was created.

A complex's unit directory stays one column of rows at 64 px, because a unit is reached through
its complex or its contract and a tile spends room its two facts, its status and its occupant, do
not need. *Tickets 16 to 18 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]],
requirement 18 as the human narrowed it on 2026-10-02 (units keep their rows); the tenant and
contract tiles recorded by ticket 27; the member and workspace tiles laid out by tickets 32 and 33
at the human's walk of 2026-10-02 and recorded by ticket 35; the member's fields by ticket 37; the
workspace's members as a count by ticket 48, at the human's walk of 2026-10-03.*

**A settings directory shows a few rows of its cards and scrolls the rest inside its own area.**
The members, roles and workspaces directories lay their tiles through one grid,
`organization/component/directory-grid.svelte`, in the list shell's columns (one, two or three by
the directory's own width, `columnsFor`), and bound them to the rows in view at those columns:
two rows at one or two across and three at three (`rowsInView`), so two cards, four or nine.
Past that the cards scroll in an area exactly that tall, gaps counted, so no card is cut in half,
computed again whenever the width changes the columns; with fewer cards the area is as tall as
they are. The tray (search, count, order, the plus) stands above the area, outside it. The area is
the platform's own scroll (a native overflow, as every bounded list here scrolls; the package
holds no scroll primitive), a region named by the directory's heading, its foot fading with a
still mask while more cards are below. Keyboard focus reaching a card the area cuts off brings
the whole card into view at once, with no smooth scroll, and a press does not move it. A
workspace page's members are not bounded: they are the page's only collection, so the page's
scroll is theirs and a second one would nest inside it. *Ticket 53 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the human's walks of
2026-10-03: "in settings members and roles each one should havea 4x4 cards as masx then more will
result in a scorlling area", then "for mobile size 2 cards then becomes an area of scroll; for mid
screen 2 columns become 4 cards meaning 2x2; for full screen 3x3 cards 9 cards", the workspaces
directory included.*

### Search

**Every set a person can search searches one way: `list/component/search-field.svelte`.** A leading
search glass, a wait of 250 ms after the last keystroke before the term becomes the search, and
`/` to put the cursor in the field from anywhere on the surface. The list shell draws it, the
contract's unit panes draw it, the settings members, roles and workspaces directories draw it,
and so does a workspace's add sheet, its words saying what it finds (`placeholder`), and a set added later draws it rather than an input of its own. The key is registered by the field,
so it exists exactly where there is something to search, and it stands down while text is being
typed. **A surface answers the key once**: where it draws two sets, the one a reader searches
holds it and the other's field is reached by pointer or by tab (`answersSearchKey`). The
organization section's members directory holds it where it is drawn, since a dozen people are
searched and a handful of roles are read, and the roles block holds it where the members
directory is not drawn. *The settings directories were members and workspaces, one to a section,
until ticket 19 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] gave the roles
block the bar and put two sets on one section.*

**A set drawn as a directory opens with the list shell's own bar,
`list/component/list-toolbar.svelte`**: the field at one end, and at the other the count, what
narrows the set, the order, and what acts on it, in that order. The list shell draws it above its
records and the settings directories above their cards. What a directory does not want it leaves
out: the settings directories offer no export, since a dozen accounts are not a file anybody
wants, and a workspace's own file is exported and imported from each workspace card's acts
(*Export and import*), not from the bar. The contract's unit panes are
two halves of one transfer rather than a directory, so they take the field and not the bar: the
field on the bar's surface, and their units as the record cards every unit list draws, with the
unit's acts and the transfer beside them. Every list offers an order, the unit directory and the
ledger included; a ledger ordered by amount drops its month headers, which only a ledger read in
time can keep.

**What a term matches is the set's, and it folds.** A list's read folds both sides in SQL and a
set held in memory folds both sides through the same table (`foldSearchText`, through the
palette's `matchesTerm`), so a term typed in Arabic-Indic digits, or with another alef, finds
what its other spelling finds wherever it is typed.

**The command menu is the application's search, and it opens on Ctrl/Cmd+K from every screen.**
The frame mounts it once above whatever route is drawn, and the key is an application shortcut
that does not stand down in a field, so it answers from settings, from a record page and from
inside any set's search field alike. It is not mounted while nobody is signed in, when there is
nothing in a workspace to find, and its titlebar control reads unavailable then.

*Why: search was a debounced field with `/` on one list and a bare input searching on every
keystroke on the next, so a reader could not predict what typing would do from having typed in
its twin. And the settings directories had no search at all, which is what a directory is for.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 7.

### Filter

**A list narrows by what its concept declares, and the list shell draws every narrowing the same
way.** The concept hands the shell `filterOptions`, declared in `list/filter.ts`: a choice over
the concept's own values (a contract's attention rank), or the one period filter,
`PERIOD_FILTER`, which every surface asking about a span of time offers rather than naming a
period of its own. The shell draws each as a funnel control in the bar, after the count. Its menu
lists the values with the chosen one checked, and *clear filter* beneath them once one is chosen;
choosing the chosen value again clears it too. A narrowed list says so by the control being
filled, and the control's accessible name carries the value, so a reader who cannot see the fill
still hears what the list is narrowed to.

**The narrowing happens in the concept's read, never over the rows already loaded**
([[rules/data]], under *List reads*): a filter over what was fetched answers a different question
than a filter over what exists. A narrowing that matches nothing is the *no match* state
(*Empty*, below), whose act clears it. Today the contracts directory, a tenant's contracts and a
unit's contracts filter by attention rank, and the payment ledger by period.

**A stated exception: the dashboard's period picker is a text control.** The collected figure's
period is chosen from a menu over the same `PERIOD_FILTER` vocabulary, but its control is a quiet
button showing the chosen period's name, not a funnel (`dashboard/component/landing.svelte`). The
chosen period is what the band's figures mean. A list's filter narrows records the reader can see
for themselves; this one changes what a number says, and a figure without its span of time can be
read wrong without looking wrong, so the span is on the control rather than behind it.

*Why: the one list that filled the filter position built its own control, and every list doing
the same would have looked like a different application on each screen.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

### Sort

**Every list offers an order, through the bar's one sort control**
(`list/component/list-toolbar.svelte`). The concept names its orders as `sortOptions`, built from the
column ids its read orders by, so the control cannot offer an order the query would refuse. The
control is an icon after what narrows, filled while an order is chosen, and its menu marks the
chosen order's direction. Choosing an order starts it ascending, choosing it again reverses it,
and a third time gives the list back its own order (`nextListSort` in
`packages/design/src/lib/sort.ts`). The list shell and the settings directories draw it alike. Which
lists offer an order, and why a ledger ordered by amount drops its month headers, is *Search*'s.

*Why: the unit directory and the ledger offered no order while every other list did, so a reader
could not tell from one list what the next would let them do.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

### Row activation

**A row opens its record's page, everywhere, and does nothing else.**

A row-level action is an explicit control on the row, never the row itself. Every record a row
can show therefore has a page to open, payments included.

*Why: a click that means three different things depending on the surface asks the reader to
know which surface they are on before they know what will happen.*

Recorded originally as ADR 0025, *A row opens its record, and does nothing else*.

*Noted 2026-09-17, an accepted deviation: **in the settings directories a record's page is its
sheet.** A member and a role have no page of their own, so the card in the members and roles
directories opens the record's edit sheet on the same address
(`?section=organization&member=<id>`, `?section=organization&role=<id>`), and does nothing else;
the acts are still explicit controls on the card. A workspace left the deviation with ticket 49 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: it has a page
(*Record surface*), its card opens it, and an address naming one on its section
(`?section=workspaces&workspace=<id>`) is sent on to it. Requirement 23 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] is the precedent, and the
human accepted it at that effort's review round two on 2026-09-17.*

*The deviation named the members and workspaces directories alone until ticket 19 of
[[efforts/838-permissions-are-a-role-and-an-override/spec]] added the roles directory beside them,
for the same reason: a role became a record of the organization's own with that effort, and what
opening it means is its editor (`organization/role/component/directory.svelte`).*

*Kept by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 8: the two
directories declare their acts in `organization/member/acts.ts` and `organization/workspace/acts.ts`
like every concept (*Record card actions*,
below), and the sheet a card opens is the organization host's, mounted in the frame. A member's or a
workspace's acts are gated on who is reading as much as on the record, so the record an act is given
carries the reader's facts beside the member or the workspace. Those facts are read in one place
(`memberReaderOf` and `toMemberActContext` in `organization/member/acts.ts`, `workspaceContextOf` in
`organization/workspace/acts.ts`), by the
settings area for its directories and by the command menu for its own offer, so neither can gate an
act the other does not. A member's name is part of its one edit, so the card offers *edit* and never
*rename* beside it.*

### Record card actions

**A record's acts are declared once per concept, and every surface offering them is a projection
of that declaration.** The concept writes one ordered list in `apps/desktop/src/lib/<concept>/acts.ts`,
of the `RecordAct` shape in `act/act.ts`: each act's id, label, icon, tone, group, shortcut, the
flag a member needs to take it, and the concept's own rules for whether it applies to a record
(hidden where it does not) and whether it is unavailable (shown, refused, with the reason). Three
surfaces and the command menu read it:

| Surface | Projection |
| --- | --- |
| the card's visible control, and its context menu | `toCardActions` |
| the record page's action cluster | `toPageActions` |
| the command menu, before and after the record is named | `toPaletteActs`, `toPaletteVerbs` |

So label, icon, order, tone, shortcut and availability cannot differ between them, and a card offers
what its page offers, copy details and duplicate included. `act/tests/act.test.ts` holds every
declared concept to it, for a record in each state it can be in.

**An act's `flag` is the flag its procedure names**, one of a record kind's view, create, edit and
delete. It is read against what the reader may do in the workspace open, held once for the window
by `workspace/component/permissions.svelte` in the `permission/` capability, off the same facts the
tRPC context folds: the session's permissions, what is pinned for the reader in the workspace open
(the workspace layer, `effectiveInWorkspace`), and the grant on it. Where the reader
lacks the flag, the act is shown refused on every record, and the reason names the flag, or the
read-only grant where that is what clears it. That reason comes before the act's own `unavailable`,
so a record that would refuse for its state as well is refused for the flag. The command menu does
not offer the act at all before a record is named, since what the reader may do is known then and a
row that could never run would answer every search for it. A host asked for an act by id refuses it
on the same terms (`mayRun`). *Added by ticket 16 of
[[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement 10: the act carried its
flag since ticket 10 of that effort, and this section did not name it.*

**An act never opens a form or a dialog itself.** Its `run` asks the concept's host, declared in its
`surface.ts` and mounted once by `shell/component/frame.svelte`, which owns every form and
confirmation the concept's acts open and exposes `run(actId, record)` and `create(prefill?)` through a
module store (`contract/host.svelte.ts` is the first). A surface mounts none of them, so there is one form per
concept in the tree, and the command menu reaches every act from any screen: choosing one asks for the
record, and the host reads it and refuses, with a sentence, an act that record does not admit.

A member's and a workspace's acts are gated on who is reading, which the menu knows before a record
is named, so it goes one step further for them (`organization/palette.ts`): it offers only the acts
this reader can take on somebody, and once one is chosen it lists only the members or workspaces
that act admits, all of them before anything is typed, since an organization's are a handful. A
record the act admits but cannot run on now, behind a write already running, is listed and refused
with the reason. They are found only through an act: a member or a workspace is opened from its
settings directory.

**Groups and shortcuts.** Acts fall in `primary`, `lifecycle` and `destructive`, in that order on
every concept, and the card's menus draw a separator wherever the group changes. An act's shortcut,
where it has one, is printed beside it on every surface: a `Kbd` in both of the card's menus, in the
page control's tooltip, and on its command-menu row.

**The card's two routes are not equals, and the asymmetry is the rule:** the visible tertiary control
is what the card promises and holds every action, reachable by pointer and by keyboard; the context
gesture is derived from the same list and may hold nothing the control does not. One block owns the
card's markup, so a surface inherits both routes instead of choosing.

*Why: a gesture-only card promises nothing, and keyboard users reach no action at all. And an act
wired per surface was written three times and drifted: cards never offered copy details, and the
contract form was mounted four times over.*

Recorded originally as ADR 0034, *A record card carries its actions twice, and one block owns both
routes*. Revised by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirements 7
and 8: contract is the first concept declared this way, and the others follow it.

### Delete and confirm

**Every dangerous act asks first, with no exception.** An act that deletes, ends, removes, signs
out, disconnects, forgets or hands something over puts a confirmation in front of the reader before
anything is written, from every route that offers it: a record's card menu and its context menu,
its page, the command menu, a selection's bar, and every row of the settings area. That covers the
records' deletes (tenant, complex, unit, contract, payment), terminating a contract, the
organization's acts (deleting a workspace, removing a member or locking one out, resetting a
member's password, signing a member out everywhere, deleting a role, withdrawing an ownership
offer, transferring ownership, revoking a link waiting to be opened), signing out another machine
or every other one, disconnecting
this machine, forgetting the Turso account (in settings and in setup), deleting
the organization, and removing the organization stamp. Leaving the question does nothing.

**The question names what ends and whether anything brings it back.** The record leads, as the
surface names it; the line under it says what goes and what puts it back: undo while the
application is open for a record's delete, restoring for a termination, signing in again for a
sign-out, a new link for a member's reset or a revoked link, offering again for a withdrawn offer,
and *nothing* where
nothing does. A record's delete still lands inside undo once answered, and its announcement still
carries the undo control (*Undo*).

**A record act declares that it asks.** Every act in the error tone declares its `confirmation` in
`act/act.ts`, `reversible`, `cascade` or `irreversible`, saying what the question says brings it
back; the type refuses an error-tone act without one, and every act in the `destructive` group is
in the error tone. No value runs an act at once. The host owns the question and opens it on every
run, so the card, the page and the command menu reach the same one.
`act/tests/dangerous-acts-ask.svelte.test.ts` finds every `acts.ts` under `src/lib`, holds each
error-tone act to a declared confirmation, and runs each through its host to find a dialog in front
of the reader and nothing written, so a dangerous act added without its question fails there. A
record's own parts are the record: a contract's unit assignments go with it and come back with its
undo, so releasing its units is not a cascade.

**A delete whose cost turns on the record declares what the record alone costs, and its host
resolves the rest.** A complex's units are records of their own and go with it, so deleting a
complex that has units is a cascade ([[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]],
requirement 22). How many units a complex has is on no record a surface holds, so the act declares
`reversible` and the complex host, which reads the deletion's plan, takes the policy
`toComplexDeleteConfirmation` gives for the complex in front of it (`complex/acts.ts`). The dialog
it opens names the units that go, and the delete is undone whole, the units included. Until the
plan is read the dialog offers no delete, since what it would say goes may not be what goes.

**A delete asks in `packages/design/src/lib/block/delete-dialog.svelte`**, whose button names the
verb (*delete*, *remove*), never *confirm* or *OK*. **A refused delete is still refused, and says
why**: where something stands in the way (a tenant with contracts, a complex one of whose units a
contract holds), the same dialog opens in its blocked state, names what stands in the way and offers
no destructive control. The procedure refuses it either way. **A selection asks in
`block/selection-dialog.svelte`** (*Bulk selection*).

**An act that is not a delete confirms in `packages/design/src/lib/block/confirm-dialog.svelte`**,
titled and labelled with its own verb: terminate, restore, sign out, forget the account, disconnect,
withdraw. It has no default title or button word, so a caller cannot fall back to *delete*. Its
control is destructive for an act that takes something away, and the ordinary primary control for
one that gives something back (restore). **Signing this machine out asks nothing**, from the account
menu at the foot of the rail and from the account section alike, and goes straight to the wall: a
password brings it back and nothing else is lost. *The human's word on 2026-10-06 (effort 851,
requirement 45): "it's simple it should just signout". It asked in
`organization/session/component/sign-out-dialog.svelte` from 2026-10-02 until then.*

*Why: the human walked the built application on 2026-10-02 and asked, in their words, to "make sure
deangours actions have confirmation dialog even in domain records deletes have confirmation dialong
and dangours actions". This replaced two exemptions: an ordinary record delete ran at once and
offered undo (effort 832, requirement 11, on the reasoning that a question asked of every delete is
answered without reading), and signing this machine out asked nothing because signing in undoes it
(effort 846, requirement 2, after the HIG's *Alerts*). The reader would rather answer one more
question than lose a record to a stray press, so every dangerous act asks, and the question says
plainly what brings it back so the cheap ones read as cheap.* *Revised by
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1's revision of
2026-10-02 and requirement 2, ticket 40.*

**A stated exception to the dialog, not to asking: deleting the organization is a heavy form with a
password.** It removes every workspace and everything in them, every member's way in, and every
other machine's place in the organization, and nothing puts any of it back: it is the one act in
the application that nothing undoes. So it takes the shared form surface at the heavy weight
(`organization/component/delete-organization.svelte`). Its body says what goes in the plainest
words there are, and the owner's password is the confirmation, refused on its own field when it
does not open the owner's vault (*Validation errors*). A question answered with one press is the
wrong weight for the act a reader can least afford to answer without reading. Transferring
ownership asks the same way, in its own surface with the owner's password
(`member/component/offer-ownership.svelte`).

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 11.

### Undo

**A change to a workspace's records can be taken back while the application is open, by the
announcement or by the key, and the two do one thing.** A mutation that declares an `inverse` in
`mutation/mutation.ts` leaves it on the session's stack, and its announcement carries *undo*.
Ctrl/Cmd+Z takes back the change on top of the stack, and Ctrl/Cmd+Shift+Z or Ctrl+Y applies it
again. The stack, the offer and the key pair are the `undo/` capability's, and nothing outside it
knows how undo works. Both are application shortcuts that stand down in a text field, where those
keys are the field's own, and under a cover: while a form, a sheet or a confirmation stands over
the page, the keys are still taken from the webview and move nothing, because the change on top of
the stack is one the reader cannot see from under it (`undo/key.ts`, asking `isCovered` in
`shortcut/covered.ts` at each press, as the create key does; the command menu is not a cover). The
command menu offers both by name, saying why where there is nothing to move.

- **What was taken back is announced, with the offer to apply it again**, so undo and redo answer
  each other from the same toast.
- **One offer at a time.** Only the change on top of the stack can move, so a new offer withdraws
  the one before it rather than leaving a control over somebody else's change.
- **An offer stays eight seconds**, longer than an announcement that only has to be read, because
  it also has to be decided on and reached for.
- **Leaving a workspace or a session forgets the stack.** A workspace switch (`startup/switch.ts`),
  a sign-out, the sign-in wall going up, and selecting or removing an organization
  (`startup/wall.ts`, `startup/machine.ts`) each call `machine.ports.undo.forget()`, which is
  `forgetEveryChange` in `undo/undo.ts`: both directions are emptied, an inverse still in flight
  cannot land, and the offer on screen is withdrawn (`undo/move.ts` dismisses it when the stack has
  nothing left to move). An inverse is a statement about one database, so one replayed after a
  switch would reach the wrong workspace (effort 854, requirement 1).

Every create, edit and delete of a tenant, complex, unit, contract or payment is inside undo, as
are a contract's renewal, termination, restoration and units, and every action on a selection
(*Bulk selection*, below), which is one change however many records it touched. **Two things are
outside it, by decision.** The organization's acts (members, workspaces, passwords, the
organization itself) are the shell's rather than a workspace's records; the ones that take
something away confirm instead (*Delete and confirm*). And a file imported is not taken back,
because its inverse would be a file's worth of deletions hung off a toast (`workspace/query.ts`).
The mechanism, replaying inverses through the real procedures, is [[rules/data]]'s, under *Undo*.

*Why: undo is what a record's delete question names as bringing the record back (*Delete and
confirm*), and it can only carry that promise if the reader can find it the same way after every
change.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 11; what
leaving forgets and what a cover holds, by [[efforts/854-bugs-and-edge-cases-across-the-app/spec]],
requirements 1 and 12.

### Create

**Every set a person can add to offers one create control, in one place, and one key.**

- **The control** is `create/component/control.svelte`, and nothing else draws a create: a
  quiet plus, its words in the tooltip and on the control, with the key beside them. It stands
  **last at the end of the bar above the records**: `list/component/list-toolbar.svelte`, which the
  list shell draws and the settings directories' tray (`organization/component/directory-tray.svelte`)
  draws too. A set
  that may not be added to right now keeps its control, refused, with its reason on hover and focus
  (*Guidance*, below); the workspaces tray puts its refusal in that place instead.
- **A set of more than one kind keeps its one plus, and the form chooses the kind.** A contract's
  payments take a payment and a refund: the plus and the key open the payment form, whose two tabs
  (a toggle group, each with its glyph pointing the way the money moves, `banknote-arrow-down` in,
  `banknote-arrow-up` out) are the two kinds. It opens on the payment where the contract takes one
  and on the refund where it does not. A tab the contract does not take is dimmed in place, says
  why on hover and on a focus the reader moves to it (never on the focus the surface places as it
  opens, which the toggle group puts on its first tab), and cannot be chosen, as any refused
  control does (*Guidance*): the reader
  never stands on a tab whose create would only be refused, so the form's create is never the thing
  dimmed. A contract never takes both at once, since a live one refunds only what was paid beyond
  its total and a terminated one takes no payment, so one tab is always the dimmed one and says
  which way money can move now. The plus is refused only where neither may be made, with the
  payment's reason (`payment/component/form.svelte`; effort 854, requirement 25).

  *Why: the human, 2026-10-07. A refund alone on the ledger's balance footer was away from where
  every create is looked for, and a second create in the bar split one act in two; recording money
  is one act, and which way it moves is a value of it.*
- **The key** is Ctrl or Cmd with N, an application shortcut in the registry
  (`create/key.ts`, registered by `create/component/shortcut.svelte`). It is answered
  by the set on screen: a drawn control holds its place (`create/target.svelte.ts`) and the
  last one drawn answers. Where no set is on screen the key is unavailable and says why, and it is
  still taken from the webview, which would otherwise open a window. A form or confirmation standing
  over the set takes the key and opens nothing a second time.
- **The command menu** creates every concept a person can (each record's `create` in its
  `surface.ts`, which `palette/` offers): tenants, complexes and contracts in their directory,
  and a unit or a payment after asking, in the menu's asking mode, for the complex or the
  contract it cannot be without.
- **Every route reaches the concept host's `create`**, and nothing else opens a create form. The
  command menu's `?create` on a directory is consumed by the host, which owns the form
  (`create/intent.svelte.ts`), and never by the directory.

*Why: a create drawn per surface came from two icon families and was reached by a link the
directory itself had to answer. A reader who has added a tenant knows where to add a payment,
and the key does what the control does because it asks the same call.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 9. The
key is Ctrl/Cmd+N because the page can answer it in WebView2
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-create-key]]).

### Edit

**An edit is the concept's create form, opened on the record.** Every concept declares one edit
act in its `acts.ts`, labelled *edit* and drawn with the square pen, members and workspaces
included, and it is offered wherever the record's acts are (*Record card actions*). It asks the
concept's host, which opens the form create opens, at the same weight (*Form surface*), filled
from the record, with a submit named for its verb. **There is no inline edit**: a value on a card
or a record's page is read there and changed in the form. An edit is inside undo (*Undo*).

*Why: one concept said "rename" where the next said "edit" for the same act, under two different
pens, and a complex opened a different surface for edit than for create.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirements 8 and 10.

### Bulk selection

**Selecting is a mode a list turns on, and only a list with something to do to several records
offers it.** A list given `selectionActions` draws a select control in its bar beside the filters,
filled while the mode is on. Each card then carries a checkbox, shift extends a run from the last
record picked without it, and leaving the mode puts the selection down, since a set held out of
sight is one the next action would act on by surprise. The selection is held by id, so it
survives the virtualised rows scrolling past, and it names only records the list still shows.

**While anything is selected, a bar stands above the records, never over them**: the count, the
concept's actions, the list's own *export selection*, and *clear selection*. The actions are the
controls a record's own cluster wears, labelled with the count: delete for tenants, complexes,
units and payments; terminate, restore and delete for contracts, declared once in
`contract/component/selection-actions.svelte` for the three surfaces that list contracts.

**An action on a selection always asks first, in
`packages/design/src/lib/block/selection-dialog.svelte`, because what it asks is not "are you
sure".** The concept plans the action, and the dialog shows the outcome before anything is
written: how many would go through, and how many would be turned away, counted by reason with a
few of them named. Where nothing can go through it offers no destructive control. What landed is
announced through the mutation's declaration, with a second notice where the workspace moved
between the plan and the write, and the whole action is one change to undo.

*Why: a selection is a set the reader assembled, and part of it may be refused for reasons
nobody can see from the rows. A delete of one record says at once whether it went; a delete of
nine has to say which of the nine before it runs, or the reader learns it from what is left.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

### Export and import

**A list's file goes out and comes in through one control in its bar**: the transfer menu, after
the order and before the create, holding *export* and *import* and nothing else.

- **Export** asks which file in `packages/design/src/lib/block/export-dialog.svelte` (csv, chosen
  by default, or a workbook), then where, through the system's save dialog. It writes the rows the
  list is showing, under its search and order, in the columns its rows show (`exportAs`), under a
  name that carries the list and what narrowed it. It announces where the file went and opens its
  folder; walking away from the save dialog writes nothing and says nothing. A list with no rows
  cannot export, and its entry stays in the menu, refused, saying so (*Guidance*). With a selection, the selection bar's *export selection* writes only the
  selection, under a name that says so.
- **Import** reads a file into the directory it was opened from, through
  `transfer/component/directory-import-dialog.svelte`: choose the file, see what it would do, then
  agree. **Nothing is written before the last step.** The dialog says how many rows go in, how many
  do not and why, and which rows to go and look at. A row wrong on its own is turned away and the
  rest goes in; a file whose rows contradict each other is refused whole and offers no import
  (`transfer/import.ts`). An import is outside undo (*Undo*).

Tenants, complexes, units, contracts and payments offer both. A contract that takes no new payment
refuses the import on its ledger, with the reason its create is refused (`importUnavailable` on
the list shell), since an import only adds payments. The settings directories offer neither (*Search*).

**A whole workspace is one file, and it moves from that workspace's card** in the settings
area's workspaces directory, never from a record directory: a directory's control writes that
directory's records and nothing else. *Export* and *import* are acts on every workspace card the
reader holds, declared with the card's other acts (`organization/workspace/acts.ts`, *Record card
actions*), so the card's menu, its context menu and the command menu offer the same two, whether
or not the workspace is open on this machine. Each is refused, with the reason, by what the reader
may do in that workspace (every kind's view to export, every kind's create to import, a read-only
grant there refusing the import), not by what they may do in the one open. The organization host
runs them (`organization/workspace/component/host.svelte`): the export asks where through the
system's save dialog, reads that workspace, writes the workbook and opens its folder; the import is
one dialog (`transfer/component/import-dialog.svelte`), named for the workspace it reads into, which
shows a line per sheet and confirms with that workspace's id, and a reference nothing in the file
answers refuses the whole file. The open workspace's file moves through this machine's replica,
offline included; any other is read and written on Turso without being opened here, so it needs
Turso reachable, and unreachable the act says so when pressed and writes nothing.
*It moved from a block beneath the directory that moved the open workspace alone, by
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 15.*

*Why: the export was an icon that could say export and nothing else, so a second format had nowhere
to be named and the other direction had nowhere to go.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

**A stated exception: the earlier records skip choosing a file.** Where this machine still holds the
records of 0.12.0 or 0.13.0, a callout above the settings area's workspace cards
(`organization/workspace/component/app-database-records.svelte`) opens the same workspace import
review over those records as the shell reads them from the earlier version's database, rather than
over a file the person chose. It names the workspace open on this machine as the one it fills and
writes into that workspace by its id; with nothing open it says to open one and offers no act
(effort 846, requirement 17). There is no file for the person to choose, since the records sit in the earlier
version's own data, and nothing the pattern protects is lost: the plan is still shown, sheet by
sheet, before anything is written. Settled by
[[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement 18.

### Print

**A record prints through the application's own preview, then the one print sheet.** The act is a
record act in the `primary` group, drawn with the printer glyph whatever it prints, and it asks the
concept's host. The host reads what the page states afresh and opens the preview
(`print/component/preview.svelte`): the edge panel, a language choice on top that opens on the
application's own, the page below drawn as paper, and two acts, *save as PDF* and *print* (the
primary). Either hands the same page to `sendPage` (`print/sheet.svelte.ts`), which closes the
preview and waits for it to be gone before anything prints (a surface left open is laid out for
paper and back again on every pass, and flickers), shows the sheet alone under `@media print` and
asks the host to print it: on Windows the host prints it from a print window behind the
application, so the application never shows its paper layout, and a PDF is written with no dialog
and paper goes through the operating system's dialog, never the webview's browser preview;
on macOS and Linux both open the system's print panel (`tauri/src/print/`).

The page is paper: light whatever the window's appearance (`.paper` in the token layer), in the one
language chosen, set out as a document with the organization that issued it at its head and its
organization stamp at the foot where one is set (the code's *mark*, set in its settings),
with Western digits. Where
the host refuses, the reader is told in one sentence (`showErrorSentence`); a saved PDF is
confirmed in a toast. Today the contract prints its schedule and a payment its receipt.

*Why one sheet in the main window: a second window runs startup again against the same replica,
and an iframe's print does nothing on macOS
([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Printing: the approaches
weighed*).*

## Forms

### Form surface

**A form presents two ways from one component, in CSS.**

Never render a dialog below the breakpoint and a sheet above it. Which presentation appears is
decided by a **weight the form declares** — light or heavy — with the window deciding only
whether that presentation fills the width it has.

*Why: swapping components across the breakpoint destroys and recreates the subtree, taking the
user's typed values, validation errors, scroll position, and focus with it — and a sheet here
is already a dialog, so there was never a second component to swap to.*

Recorded originally as ADR 0017, *A form surface is one component that presents two ways, not two components swapped*.

**A concept's weight is decided by its create form, and holds for edit.** It is **heavy** when the
form chooses other records or writes more than one record (contract, complex with its units, tenant
with its phone composite, member, role), and **light** otherwise (payment, unit, rename, password).
So a complex is heavy for both create and edit, and a concept never opens on two presentations.
**A role is heavy although its form holds one name and one set of flags** (`role/component/editor.svelte`):
a new mask moves the permissions of everybody holding the role, so its save issues every
holder's certificate again in the same act, and the form writes as many records as the role has
holders. *The editor declared the weight before this paragraph named it; ticket 19 of
[[efforts/838-permissions-are-a-role-and-an-override/spec]] wrote down why.*

**A member's two sheets share one layout.** The sheet that adds a member
(`organization/member/component/account-form.svelte`) and the sheet that edits one (`member/component/sheet.svelte`)
draw the same sections, in the same order, with the same legends and control shapes, from the same
pieces: the username under its head, the role picker in its tray (`member/component/role.svelte`), the
switch list under it (`member/component/override.svelte`, which draws `role/component/permission-switches.svelte` with
the role to compare against and the reset), and a switch per workspace
(`member/component/workspaces.svelte`), where off is what not granting it is. Only the sentences that
belong to the moment differ, and the permissions beneath a workspace that is in, which the edit
sheet alone draws, since what a person may do in a workspace is set once they are in it. Who may
hand out what is decided in the shared pieces, so the two sheets cannot gate differently. *Settled
by ticket 42 of
[[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the human saw the two side by
side in the running build, the add sheet drawing an uppercase label, seven checkboxes and a checkbox
per workspace, and asked for it to read like the edit sheet.*

**The role picker chooses among the organization's roles, and the switches under it show what
the member ends up with.** The picker is a select over every role but the owner's, highest rank
first, with the sentence a built-in role means under it; a role at or above the reader's own rank
is drawn refused in the list, and the tray says why. Under it is the switch list the role editor
draws (`role/component/permission-switches.svelte`), set to the role's mask exclusive-or'd with the override; a
switch turned writes the override that makes the member end up with what the switches say, and the
override itself is never shown. A switch that differs from the role carries a dot naming it; where
any does, the role's name reads *custom* in the tray and the switches' head offers *reset to* the
role, which clears the override. Picking another role makes the member that role exactly, clearing
the override as the shell's `assignRole` does; picking their own role again puts it back. A role
whose pick would move a flag the reader does not hold is drawn refused in the list with that reason
under its name, naming the flag, and the save of a changed role sends the override the switches
come to whenever it is not nothing, since the shell clears what is not sent (ticket 45 of effort
838). A switch the reader does not hold is dimmed and says
why at the control, and one sentence above the list says why once; where the reader may not change
the role or the override at all, the whole section is refused with the reason, the flag they lack
or that the card is their own. On a member's card both sections are drawn for every reader, since
they are what the card is for, and its save sends a changed role and a changed override as one
act, whose refusal marks both; an override changed alone is its own write.
*Revised by ticket 16 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], requirements
6, 7 and 12: the role was a toggle of two and the sheets drew what a member may do beyond their
role as a list with a picker (`member-acts.svelte`, retired by effort 838); the role and the
override were saved as two writes until ticket 14 of the same effort made them one. The override
editor was a table of three columns, what the role gives, a box meaning "changed" and the result,
until ticket 43 of that effort, the human's call on the running application of 2026-09-27
(requirement 12 as amended).*

**A member's workspace is its access switch, with its permissions folded beneath it.** Each
workspace the reader holds is a switch headed by the workspaces' building glyph: on is a
full-access grant, off is none. Beneath one that is in, on the member's card, one folded row,
*permissions*, reads *custom* beside it where what the member may do there differs from what they
may do across the organization, and opens the record groups of the switch list
(`access/component/tailoring.svelte`, drawing `role/component/permission-switches.svelte` with `records`), each folding
in turn, set to what they end up with there. **What is set there is what differs**: a switch
turned away from what the member holds across the organization is pinned for that workspace at
its new value when the card is saved, and holds it however the organization moves; a switch turned
back is pinned no longer. Each switch that differs carries a dot saying so. There is no read only
and no reset button: read only is every add, edit and delete turned off, and turning the switches
back is the reset. Read only mints nothing: it is those switches, enforced by the application. A
grant minted read only before is drawn with its writes off, marked, and a write turned on over it
grants the workspace again at full access, every write left off then pinned off. Picking
another role, or putting the member back on theirs, clears what is tailored in every workspace, as
the shell does, and is refused at the control where a flag set in any workspace is one the reader
does not hold. Turning a workspace off and on again puts back what it held, and is never refused,
since it writes nothing. The words *full access* and *no access* are not on the card. Refusals are
drawn as the switch list draws them, dimmed with the reason at the control and each reason said once
above its list: every workspace switch without `grantWorkspace`, naming it, on the member's card,
which draws the section for every reader; the workspace's own switch where the reader holds it read
only, since full access is their own credential re-sealed (a withdrawal stays theirs); every
switch beneath a workspace without `overrideMember`, naming it; one that would set or unset a flag
the reader does not hold; and, over a grant minted read only, a write where the reader holds the
workspace read only, since granting it again at full access is their own credential re-sealed. A
member ranked at or above the reader is refused at the card's edit act, which opens nothing. The
acts are the grants that exist (`useChangeAccess`), sent only for the workspaces that changed, then
one workspace override per workspace whose pins changed, carrying what is pinned there and which
of it is on (`useSetWorkspaceOverride`). **A workspace's members live on its page**
(*Record surface*), given from the other end: members are checked in the add sheet's one list and
put in on its save, and each member in it is a card whose menu takes them out. Putting somebody
in is refused by the one rule the member's card reads (`accessRefusalOf` in `access/access.ts`),
so the two ends cannot refuse differently, and the sheet's one save writes a grant for each
member checked through the same write (`useChangeAccess`), in the list's order: a refusal stops it
there, the grants before it stand and leave the list, and the sheet stays open saying the reason
and that those still checked were not put in, still checked, while the shared handler says it
too. Taking somebody out is the card's *remove from workspace*, red, asking first
in `block/confirm-dialog.svelte` under its own verb and saying adding them again gives it back,
then one withdrawal through the same write. A person tailored there is marked *custom here* on
their card, and *edit permissions*, the card's press and its first entry, opens a sheet of that
workspace's permissions alone: the switches the member's card folds beneath the workspace
(`access/component/tailoring.svelte`, standing open), its description saying they override the
organization's and the role's permissions for this workspace, saved through the same writes the
card makes for one workspace (`useSetWorkspaceOverride`, then the read-only grant lifted where a
write was turned on over it). The owner and the reader are not cards, and are not offered.
Without `grantWorkspace` the plus is refused and says so, naming it, and so is every card's
removal, as the member's card refuses its section; where the reader holds the workspace read only
the plus is refused for that, and the removal still runs, since a withdrawal stays theirs; with
nobody left to put in, the plus says so. *Edit permissions* is refused without `overrideMember`, naming it, and on a member ranked at or above the
reader, as their card's edit is. The workspace card's *members* act, which goes to the page, is
refused without `grantWorkspace` rather than hidden. *Who held a workspace was a dialog of switches under one
save, drawn from the member card's list, until ticket 49 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]: the human found the form
looked bad and asked for a page. The page drew a tile per member with the large switch until
ticket 50, when the human asked for a search field and a grid of cards with a menu; the field put
one member in at once and the tailoring opened the member's own sheet until ticket 51, when the
human asked for the directory's tray, an add sheet and a sheet of the workspace's permissions.
The add sheet was a search field opening a dropdown beside a list of the chosen until ticket 52,
when the human found a member chosen leaving the dropdown for the other list, the dropdown still
open, odd, and asked for the best way to add from the plus: one list, checked in place, as the
platform's own add-people pickers do.* *The human's calls on the running
application, 2026-09-27 ([[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement
12 as amended again and a third time; tickets 48, 49, 50 and 54): each workspace was a row of three
levels beside the role, which read as a second permission system, and the workspace's dialog
offered the same three per member; then a mini switch beneath a workspace that was in, the owner's
lock to read only, which the human found odd beside the switches and made a preset of them. At
review round one of ticket 54 the human made what is tailored pinned, since switching against the
layer beneath inverted when that layer moved, and the owner-only rule for a grant minted read only
went with the lock. On 2026-09-28 (requirement 12 as amended a fourth time, ticket 57) the human
asked for the workspace to be "a main switch to access and permissions" with the read only and
reset buttons gone, so what is pinned became what differs.*

**A submit is labelled with its verb, and carries the verb's glyph before the label.** Every submit
does, the domain forms' as well as the organization's and the startup screens': *create* takes the
plus, *save* and *update* the save glyph, and an act's own verb takes the glyph its act declares
(renew, the calendar with a plus). One convention, and it is *all*, because the primaries of
[[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]] (requirement 14) already
carried theirs.

**A refused submit moves focus to the first invalid field**, in the order the reader meets them,
and scrolls it into view inside the surface's own body. Enter submits. Every schema form spreads
`surfaceForm` from `apps/desktop/src/lib/form/form.ts` into its `superForm` call, which is where
both are set; `tenant/tests/form.svelte.test.ts` holds the focus.

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 10: complex
was heavy on create and light on edit, and the domain submits carried no glyph where the
organization's did.

**A form with changes asks before it closes.** Escape, a press on the overlay, the corner control
and the form's cancel close a form with no changes at once. Where the reader has changed
something, each first asks whether to discard the changes or keep editing, in
`block/confirm-dialog.svelte`: titled by the question, saying the changes are not saved and that
nothing brings them back, its control destructive and named *discard*, and its way out named *keep
editing*, focused first, which puts the reader back in the form with nothing lost. Escape inside
the question closes the question alone. A submit closes the form by its own path and never asks.
The surface owns the question and every close the reader makes (`block/form-surface.svelte`: its
`dirty`, and the `requestClose` it hands the form's actions, which every cancel calls); whether a
form has changes is the form's to say, since only the form sees the state it keeps outside its
fields. **A schema form opens through `seed` from `$lib/form`**, which resets it onto what it starts
with, so the record it edits, duplicates or renews is no change; a value that arrives after it
opened is written with `{ taint: false }`; and it passes `dirty` from its taint
(`isTainted($tainted)`), or'd with any state it keeps outside its fields, as the complex's form does
with a unit still in its entry. **A form without a schema compares snapshots through `isDirty`
from `$lib/form`**: it takes a `$state.snapshot` of what the reader edits when it opens, under
`untrack` in the effect that seeds it, and passes `isDirty` of that against a snapshot of the same
state now, which compares values, so a change made and undone is none. A preview with nothing to
lose (the made link, the reminder and print previews, the upgrade sheet) passes no `dirty`, and
closes at once. *Settled by [[efforts/861-the-app-never-shows-something-false/spec]], requirement 10, after
Apple's guidance to confirm before dismissing a sheet with unsaved changes: the surface closed on
any of the four with no check, and a half-filled contract or tenant was lost to a stray key or
click, which undo does not cover.*

### Field kinds

**Each kind of value takes one control**, in a form and on a record alike:

| Value | Control |
| --- | --- |
| a choice of two to four, exclusive | toggle group |
| a setting that takes effect at once | switch |
| a permission, in a role's editor or on a member's card | switch |
| a workspace a member is in | switch |
| a choice of five or more | select, or a combobox when searched |
| a length of time from fixed steps | slider, with the chosen value written beside it |
| another record | combobox over its search |
| a date | the popover calendar, given the reader's locale |
| money | the input group with the riyal sign as adornment, `inputmode="decimal"` |
| a phone | country select plus number, `dir="ltr"` |
| a status | the status icon cell |
| a count | the count cell |

**A length of time from fixed steps is a slider**, its thumb running over the steps by their place
in the list rather than by their size, the label's row ending with the value it stands on in words,
and its two ends named under the track. A link's lifetime is one: thirty steps from an hour to a
week (`organization/member/component/link-form.svelte`). *The human's word on 2026-10-06, during
[[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]] (requirement 11),
that the lifetime is picked with a slider rather than the select its thirty values first took.*

**A permission is a switch, although it takes effect when its editor is saved.** The role editor
and a member's card draw one list of them (`organization/role/component/permission-switches.svelte`):
each kind of record, and the organization, is a group that folds to its glyph, its name, how many
of its permissions are on and a chevron, and a folded head carries a dot where a switch inside
differs and a lock where one is not the reader's to turn. Opened, a group is one row per
permission, its own glyph (`organization/glyph.ts`), its name, one line of what it allows, and its
switch; adding, editing and deleting a kind are refused, saying why, while viewing it is off, and
turning the view off turns them off with it. The changes wait for the surface's save, as Discord's role editor
holds its switches until *Save Changes*. A switch whose save would be refused is refused at the
switch, with the reason: in the role editor, one that would leave a holder adding, editing or
deleting records they cannot view, naming the holder and the reset on their card as the way on; and
a role's delete that would move a holder's flag the reader does not hold names the holder and the
flag (ticket 45 of effort 838). Everything else that is saved with its form keeps the
control its kind names above, and a checkbox stays the control for a setting that waits for a
save. *The human's call on the running application, 2026-09-27
([[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement 12 as amended), against
the switch's usual reading that it acts at once: a list of thirty checkboxes read as arithmetic,
and Apple's Human Interface Guidelines give a primary switch with mini switches under it for a
hierarchy of settings in a grouped form (*Toggles*). The view was each group's switch, with its
writes as mini switches beneath it, until the human asked on 2026-09-28 for "a list of groups and
below them list of permissions with icons and descriptions", every group folding as the
organization's did (requirement 12 as amended a fourth time, ticket 57), which is the Guidelines'
disclosure (*Disclosure controls*). What
[[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-permissions-are-presented]]
weighed, finding 6a, is the risk it takes: a reader who turns one and leaves thinking it took
effect, which the surface's footer save and the member's custom mark answer.*

**No form uses a select for a choice of four or fewer.** Such a choice is a toggle group, the
chosen segment pressed: the contract's cycle (four) and the language (two), as the appearance
(three) already was. A segment carries a label and at most an icon, so where an option needs a
sentence, the sentence of the option chosen stands under the control. An option the
reader may not choose is drawn refused on its segment, never removed, exactly as it was in the
menu. `design/tests/few-options.test.ts` fails on a `Select` whose written options number four or
fewer, and on one drawn from a list that its allowlist does not explain as more than a few. The one
select the map itself names, a phone's country half, stays one: its list is the countries the
application can dial, and grows as they are added.

**A member's role is a choice among the organization's roles**, which are records the organization
adds to itself, so it takes the control another record does: a select over them, the owner's left
out, highest rank first (`member/component/role.svelte`, on the allowlist for that reason). How many there are
is the organization's to say. The same two conventions hold for it: the sentence of a built-in role
chosen, *who it is for*, stands under the control, and a role the reader may not give is drawn
refused in the list, never removed. *It was a toggle group of the two roles there were until effort
838 made roles the organization's own ([[efforts/838-permissions-are-a-role-and-an-override/spec]],
requirements 4 and 5); revised by ticket 16 of that effort.*

*Why: Apple's Human Interface Guidelines give a small set of mutually exclusive options a
segmented control
([Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)),
which shows every option at once, and keep the pop-up menu for a list too long to lay out side by
side. A select with two entries hides one of them behind a press and says nothing the two buttons
would not.*

Money is the input group with the riyal sign leading, drawn left to right in both locales as every
amount is (`formatLocaleMoney`). A date's popover holds its open state in the form, closed whenever
the form opens or closes, and keeps a collision padding of 16 so the calendar never meets the
window's edge.

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 15.

### Validation errors

**A validation error marks its own field.**

Use the shared field-error treatment: the destructive border and ring the control primitives
already draw from `aria-invalid`, an icon on the label line, and the message revealed on hover
or focus. **No form places a summary callout listing every message.**

*Why: a summary names the problem and never the field, so the reader has to map the message
back to a control themselves — and that mapping gets harder exactly as the form gets longer.*

Recorded originally as ADR 0018, *A validation error belongs to its field, not to a summary the surface places*.

## Cells

### Status presentation

**A status renders as an icon carrying no visible text.**

Its name and its description reach the reader through a tooltip and an accessible label. This
binds every surface showing a status except a tile in a grid (below), and every status in the
vocabulary of nine carries a description.

*Why: the row stops spending width on a word most readers recognise by position, and the reader
who does not recognise it gets a full sentence rather than a single word.*

Recorded originally as ADR 0023, *A status is an icon, and its word lives in the tooltip*.

**On a tile in a grid, a status carries its word.** `Cell.Status` with `labelled` draws the icon
and the word beside it, both in the status's tone, and keeps the description in the tooltip. A
tile is scanned rather than read down a column, so there is no position to recognise the icon by.
Rows, pages and every other surface keep the bare icon, but for one row: a complex's unit rows,
which stand in for the unit's card (requirement 18 keeps units as rows), draw the labelled form,
since a unit's status is one of the two facts its row is scanned for. *Added by ticket 14 of
[[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 19; the unit
rows by ticket 17.*

## Concept surfaces

### Unit presentation

**Units read as directory rows wherever they appear.**

A unit met in a complex and a unit met in a contract are the same record and read the same way.
Assigning units is a write, and a write takes the shared form surface — never a bespoke panel
embedded in a surface that reads.

*Why: one concept reading two ways depending on which tab was opened forces the reader to learn
a second vocabulary for a record they already know.*

Recorded originally as ADR 0024, *Units read as a directory, and assigning them is a form*.

### Contract unit transfer

**A contract's units are chosen when it is created, and changed on the tab that lists them.**

The contract form chooses the units alongside the tenant, offering only those free over the
form's term, and one submission creates the contract holding them. Every change after that is
the tab's: it holds both panes and performs the transfer itself. There is no assignment dialog
and no create control standing in for one.

*Why: a `+` promises to add a unit, and what it opened chose the contract's whole set in both
directions — the only way into the surface described a different operation than the surface
performed.*

Recorded originally as ADR 0029, *A contract's units are transferred on the tab that shows them*.
Revised by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 20: a
contract used to be created holding nothing, so every new contract took a second surface before
it described what was rented.

### Attention rank

**A contract's attention rank is derived in the contract domain.**

Overdue, owing, due soon, and ending soon are decided from a contract's status, end date, what it
owes today, and its schedule, so the rules live with the contract. The dashboard reads the rank;
it never derives one.

*Why: they were rules about a contract living in a module named for the surface that happened
to read them first, which is why the contracts list could not filter by rank.*

Recorded originally as ADR 0031, *A contract's attention rank is the contract's own*.

**Four ranks, read in that order, and a contract is under one.** *Due soon* holds a contract that
owes nothing today and whose next cycle falls due within the next seven days without being covered
in full; its landing row states that cycle's amount and due date. It is not a money rank: what falls
due this week is not owed yet, so the landing screen's outstanding figure sums *overdue* and
*owing* alone (`isMoneyRank` in `contract/rank/rank.ts`), and a due-soon heading carries no total. Every
list that filters by rank offers it. Settled by
[[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 11.

## Loading and feedback

### Loading

**A surface waiting on its content draws `packages/design/src/lib/block/loading.svelte`, and
nothing else.** The surface hands in a snippet drawing the shape of what is on its way (a list's
cards, a record's header, the settings area's title, its section switch and a section's grid of
group cards, the dashboard's band and its sections) from the
skeleton primitive. The block decides when that shape appears: **not before 200 ms, and once shown,
for at least 300 ms.** A load that settles inside the delay draws no skeleton at all. Until then the
region is empty and marked busy, and the skeleton, once it is up, is a status carrying the
surface's own loading sentence.

No surface draws a spinner in place of its content. **The startup progress bar is not a load and
stays as it is**, because it reports the stages of starting rather than waiting on one read. A
spinner inside a control that is working (a pressed submit, the toaster's own) is a control's state
and is not what this governs.

**A switch between workspaces is a load, and draws the loading block.** The rail and the titlebar
stay up, and where the page was, the page frame draws a page's shape with one line naming the
workspace being opened (`startup/component/switching.svelte`). The startup bar is for a launch;
drawn for a switch, it made choosing a workspace look like the application starting over. Nothing
of either workspace is drawn meanwhile, and a record's page moves to its directory before the open,
since the record belongs to the workspace being left
([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]], requirement 12).

*Why: loading had several treatments and no two agreed, and a spinner says only that something is
happening. A shape says what is coming and where it will be, and the delay and the hold keep a
fast local read from flashing a skeleton for a frame.*

### Empty

**A region with nothing to show draws `packages/design/src/lib/block/empty.svelte`, and nothing
else**: a title, an optional line under it, and one act beneath both. The block names no concept,
and every sentence of the first three situations is the caller's; the fourth, a failed read, reads
its words from the string contract, since it says the same wherever a read fails. It says which of
four situations it is, on `data-empty`, and the four never read the same:

- **Nothing here yet.** The set holds nothing, and the title says what it will hold in the
  concept's own words (*no tenants yet*), with a line saying where the records come from. Its act
  is the set's create, in words, where the set can be added to: the list shell draws it from the
  same `onCreate` its toolbar control answers, and it holds no place of its own, so the create key
  still has one answer. Where the toolbar's create is refused, so is this one, with the same
  reason (`createUnavailable`, *Guidance* below). The list shell takes `emptyTitle` as a required prop, so every list says
  its own. A set nothing may be added to (a record's history, the dashboard) offers no act.
- **No match.** The set holds records and a search or a filter narrowed all of them away. The title
  says nothing matches, never what the set will hold, and the act puts the narrowing down, named
  for what it clears: the search, the filters, or both. The list shell decides which from its own
  search and filters; the contract's unit panes and the settings directories draw the same state
  under their search.
- **Not found.** The record or the page that was asked for does not exist. Both draw one block,
  `packages/design/src/lib/block/not-found.svelte`, and it offers one way back: the back control,
  labelled, beneath the sentence, going where back goes. The record surface says so
  (`recordNotFound`, `recordNotFoundDescription` in the string contract) and falls back to the
  concept's directory; the unknown route's error page says the page does not exist, rather than
  that a screen failed, and falls back to the dashboard. A screen that failed keeps the shared
  application surface.
- **Failed.** The read of what belongs here failed, so whether there is anything is not known
  (*Error*, below). The block says the read failed and offers one act, *try again*, which runs the
  read again; its words are the string contract's `readFailed`, `readFailedDescription` and
  `tryAgain`, the last the same words the caught-error screen offers its retry in. What counts as
  a failed read is decided in one place, `error/read.ts`'s `toReadFailure`: the read errored and
  holds no data. A refetch that fails while an earlier answer is held keeps the answer, and a read
  that succeeded with no rows is *nothing here yet*. The list shell takes `failed` and `onRetry`
  from it, and while the read failed draws this state with no create, no *nothing yet* title and
  no count; every list it draws passes both. The record surface takes the same two and draws this
  state before *not found*; every record page and the workspace page pass both. A record that is
  not there is a read that answered with nothing, not one that failed: the query client refuses an
  answer of `undefined` as a failure, so a record is read through `error/read.ts`'s `readRecord`,
  which answers `null` for it. The landing screen reads its failure from the same helper and
  draws this state in place of its band and its sections (*Landing screen*). A failed read is
  never drawn as *nothing here yet*, *no match* or *not found*. *Tickets 03, 04 and 05 of
  [[efforts/861-the-app-never-shows-something-false/spec]], requirements 1 and 2.*

"No results" is not a sentence any of them says: it names neither the situation nor the way out.
Nor does the bar above a set that holds nothing yet count it: `list-toolbar.svelte` draws its
count only where the set holds something or a search or a filter narrowed it, so *nothing here
yet* is said once.

The block is sized to the region it stands in. It fills a list's frame and a record's body; a pane
or a settings section passes a class that keeps it to the space it has.

*Why: one empty sentence served a list with nothing in it, a search that found nothing and a
record that was gone, so a reader who had typed a search was told the same thing as one who had
never added anything, and neither was told what to do next. Apple's guidance is to say what will
appear and offer the action that fills it; the research behind the effort found the same practice
in every tool it read.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 13.

### Error

**What failed says so in the reader's words, where they asked for it; what is not there is not a
failure** (*Not found*, under *Empty*, above).

- **A read that failed** says so where its content would stand, in the empty block's failed kind
  (*Failed*, under *Empty*, above), with *try again* as its one act. It is not a toast: the reader
  did not act, and what they are looking at is what failed. It never stands in for a set with
  nothing in it, nor a set with nothing in it for it, and the query client retries nothing on its
  own, so *try again* is the reader's. *Ticket 03 of
  [[efforts/861-the-app-never-shows-something-false/spec]], requirement 1.*
- **An act refused or failed** is an error toast, raised by the mutation's declaration or through
  `$lib/notification` (*Feedback*, below). Its title is the reader's sentence, read from the refusal's
  code (`error/refusal.ts`), never the words a procedure or the shell wrote. A confirmation holds
  the refusal its act earned in the dialog, and a refusal that belongs to a form's field marks that
  field (*Validation errors*).
- **What the shell or Turso said behind a refusal is kept, closed**, under a disclosure
  (`error/component/detail-disclosure.svelte`). The sentence is the reader's, and the machine's
  words are for whoever the reader asks about it. So are the words behind a failure nobody can
  act on, an I/O failure or a corrupt file, which reads as its code's generic sentence: a surface
  with room draws them behind the disclosure (the sign-in wall, the setup walk, the connect
  screen, the sync standing's fault, the recovery screen's update error), and one without, a field's line or a toast, says the sentence alone. A toast has no
  room for a disclosure to open in, so `showErrorToast` writes them to diagnostics instead, and
  `toErrorText` returns the title alone. Words that carry no code, a replica's fault or an
  updater's error, read as `common.messages.unexpectedError`. They are never visible text beside
  the sentence.
- **A screen that could not be drawn takes the shared application surface** (*Application
  surfaces*), neutral in tone, since the application around it is still running
  (`shell/component/caught-error.svelte`). It offers *retry*, which draws the screen again, and
  *go home* where the frame around it still works; where the frame itself failed, retry alone,
  since every screen would draw the same broken frame. A route that failed to load draws the same
  surface from the routes' `+error.svelte` and offers the same two: *retry*, which loads the route
  again, and *go home*. Both keep the thrown message behind the disclosure, for whoever is asked
  what happened, and the route's shows its status beneath the sentence.

*Why: a refusal reached the reader in whatever language its author wrote, Turso's English
included, and an address that led nowhere was drawn as a screen that failed, which sent the
reader looking for a fault that was not there.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

### Feedback

**Every toast goes through the shared handlers.** A mutation announces through its declaration and
the handlers in `mutation/announcement.ts`; anything else, a failure raised outside a mutation or a
success nothing declared, goes through `$lib/notification`. The handlers raise through
`$lib/notification` too, so `notification/notification.ts` is the only importer of `toast` and
`notification/` the only home that mounts the packaged `Toaster`; `notification/tests/reach.test.ts`
fails on a second. [[rules/frontend]] states the same line for mutations under *Data access*.

**A notice that stands on a surface is a callout**, drawn with the callout primitive in the tone
vocabulary above, never a hand-coloured box. The contract units lock notice is the worked example:
`info`, because a locked contract is working as it should.

**Notifying is these two and nothing else.** The application tells the reader something through a
toast, raised through the shared handlers, or through a callout standing on the surface it is
about; it raises no system notification. A success or a warning is read and gone in the
toaster's shared duration, and one carrying an offer stays longer (*Undo*).

**An error toast stands until the reader closes it**, and carries the control that closes it.
`notify.error` and `showErrorSentence` raise it so, and every error path reaches one of the two,
so no caller decides it again. A success, a warning and an offer carry no close control, since
they leave on their own. **The toaster stands at the bottom end of the window**: bottom right in a
left-to-right reading and bottom left in a right-to-left one, with its close control named in the
reader's language, all three read from the design contract by `primitive/sonner`.

*Why: an error is the only channel an act that failed has, and in the shared
duration it was gone before it could be read; and the toaster stayed at the bottom right in
Arabic, where every other surface mirrors.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 12; the
error toast and the toaster's side by [[efforts/861-the-app-never-shows-something-false/spec]],
requirements 3 and 4.

## Navigation

### The breadcrumb

**The trail is built from the page's route id, and every crumb is a page.** Each feature declares
its pages in its `feature.ts` (`pages`), saying which the trail names (the directories and the
settings area), and `shell/navigation.ts` reads them off the list in `app/`; a prefix of the route
id is a crumb only where it is one of those places. A place's name is its surface's (`places` in
its `surface.ts`, in the order `app/surfaces.ts` gives them), which is also where the rail and the
command menu read their places. An address segment is not a
place: a unit's address passes through `/complexes/units`, and no page lives there.
`shell/tests/navigation.test.ts` asks every page's trail against the routes directory itself.

**A record's page ends the trail on the record, by name.** The record surface says what the record
it shows is called (`shown-record.svelte.ts` in the design package), because only the concept
knows: a contract is named by its tenant. A record reached through another runs its trail through
that one: a payment's trail is its directory, its contract, then the payment
(the page's `parent` in `payment/feature.ts`, read into `RECORD_PARENTS` in `shell/navigation.ts`), and the record surface names and addresses the
contract as its `parent`. Until the record is read, and while its read failed, the trail ends on
the directory above it, and a record that is not there is named as unknown. The dashboard and the way in carry no
trail: the first is where the application opens, and the second is a walk whose card says which
step it is on.

### Going back

**One control goes back, `packages/design/src/lib/block/back-control.svelte`, on every surface that
has a way back**: a record's page, each step of the way in, and a record or a page that is not
there, where it is the one act and says its name beside the arrow. On a record it returns to the
screen that opened the record, or to the concept's directory where there was none. A walk decides
for itself, since back from its second step is its first step on the same address, so a walk hands
the control what back does instead of a fallback. It is drawn the same everywhere, its arrow
mirrors in Arabic, and no surface draws a back control of its own.

### Switching sections

**A page's sections switch with one control, `packages/design/src/lib/block/section-switch.svelte`,
a row of links on `?section=`.** The settings area and a record with more than one collection both
draw it. Every section is therefore an address a menu row, the command palette or a link can open,
and the page draws whichever section the address names: `settings/section.ts` and
`contract/section.ts` each read every section their page has, so `?section=history` opens a
contract's history. A record's first collection is its own address, carrying no section, and an
address naming a section the page does not offer draws the first.

A switch replaces the address rather than adding to it and keeps the scroll and the focus: moving
between a page's sections is not leaving it, which is also why the back trail keys on the pathname.

*Why: the breadcrumb linked to three routes that did not exist, onboarding drew a back control of
its own, and a record's sections were a tab list writing the address from an effect while the
settings area's were links, so a contract's history could not be opened from anywhere but its
tab.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 14.

### The workspace control

**The workspace control at the top of the rail opens a menu of the workspaces the member holds,
the open one checked, then a separator and *workspace settings*** (`workspace/component/menu.svelte`),
which goes to the settings area's workspaces section. It is a place rather than a command asking
for more, so it carries no ellipsis (Apple's HIG, *Menus*).

**Past five workspaces the list scrolls, and the command under it does not.** The radio group is its
own scroll container, capped at five and a half rows so the half-shown sixth says more is below;
the separator and *workspace settings* stay in view beneath it, and five or fewer draw no cap. The
open workspace is scrolled into view when the menu opens, and a row the arrow keys reach is
scrolled into view, since the menu primitive focuses a row without scrolling to it. Both scroll
instantly, and the scrollbar is the application's one from `tokens.css`.

*Added by ticket 55 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], at the
human's walk of 2026-10-03: "in the workspace dropdwn scroollable area after 5 workspaces and only
the upper section the choosing chosises part where the ma ager owksapces is not part of the
scroable area; also the "mamnanger workspaces.." needs to be better worded". The row read
"manage workspaces…" until then.*

## Guidance

**The interface guides by what it does, not by what it says.** Three things carry it, and none of
them is a sentence of instructions.

### A field the application can fill is filled

**A form opens on the value the reader most likely wants, as a real value rather than a
placeholder**, so the ordinary case is confirmed rather than typed and the unusual one is a
correction. A new payment opens on today and on the amount due this cycle, capped at what the
contract still owes (`getAmountDueThisCycle` in `contract/contract.ts`): the cycle's rent where a
cycle or more is unpaid, the unpaid part where it is part paid, the next cycle's rent where nothing
is due yet. A default is filled once per opening and never over what the reader has typed; an edit
or a duplicate opens on the record it came from. `payment/tests/form.svelte.test.ts` holds it.

### After an act, the reader lands where the next step is

**A created record is opened, or brought into view with the focus on it.** Every create form hands
what it wrote to its host through `onCreated`, and the host decides where the reader lands:

- **a contract opens its own page**, since its units, payments and term are all read and changed
  there (`contract/tests/landing.svelte.test.ts`);
- **a tenant, a complex or a payment is brought into view in the set that lists it**, with the
  focus on its card, through `create/landing.svelte.ts`. The host names the record and the list
  block answers where it shows it: it scrolls the record into view and puts the focus on it once
  the form has gone, through the same request an arrow key raises, so the keyboard carries on from
  the new record. Each list on screen answers the request once, from the set it holds, and the next
  navigation drops it, so a set opened later or a filter cleared later never moves the focus
  (`create/tests/landing.svelte.test.ts`).

### An act that cannot run says why at the control

**An act that does not apply to a record is hidden; an act that applies and cannot run now is
shown, dimmed, refused, and says why in one line on hover and focus.** The reason is the refusal
of the act's `flag` where the reader lacks it, and otherwise the act's `unavailable`
(`act/act.ts`, read as *Record card actions* says; *this read "the act's `unavailable`" until
ticket 16 of effort 838*), and every surface draws it from the one declaration: the card's
two menus (`record-card.svelte`), the record page's cluster (`record-action-control.svelte`), and
the create control (`create/component/control.svelte`, given the set's reason by the list's
`createUnavailable`), whose key answers with the same reason, and the create an empty list offers
under its title. The command menu puts it beside the
row, where its keys would be, because its rows are chosen from the search field and never take the
focus a tooltip opens on; a record's act asked for there is refused by the host with the same line,
and a member or a workspace the chosen act cannot run on now carries it on its own row.

The control is **never the platform's disabled**: a disabled button or menu entry leaves the
keyboard's path and ignores the pointer, so its reason could never be reached. It is marked
`aria-disabled`, keeps both, refuses the press, and names its reason as its description. A new
payment on a terminated or fully paid contract is the worked case: the two paragraphs that stood
above the ledger are the create act's reasons now (`toPaymentCreateUnavailable` in
`payment/acts.ts`).

**One refusal is also said where the record stands, as a standing note: a received payment on a
terminated contract.** Its writing acts are refused in its card's menus with their reason, as
above, and its row in the ledger carries the same line under the terminated status's lock: the
contract is terminated, and restoring it unlocks the payment (`data-payment-locked` in
`payment/component/ledger.svelte`, the line `toWriteUnavailable` in `payment/acts.ts` gives). A
row's acts sit inside its menus, out of sight until one is opened, so without the note a ledger
whose every row is locked reads as one that can be corrected; and what unlocks it is an act on
another surface, the contract's restore, which no refused entry in the row's menu can be pressed to
reach. A refund on the same contract is not locked and carries no note. The spec asked for this
case by name (effort 854, requirement 25).

**The read-only notice is the other standing explanation of a refusal**, and there are only these
two. While a newer rentable has upgraded the organization or the workspace past what this build
writes, every write control is refused for that one reason; the notice says it once, as a
`warning` callout above every screen of the workspace with the update action inside it, and each
control then gives its own short reason as above (`organization/component/read-only-notice.svelte`,
effort 857, requirement 6, ticket 12).

*Why: a paragraph explaining a refusal is read once and then scrolled past, and it sits away from
the control the reader was reaching for. Apple's Human Interface Guidelines, which the human asked
design calls here to follow, keep an unavailable control visible and dimmed rather than removed,
explain it in a help tag at the control, and prefill a field with the value most people want.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 16.

## The visual reference

_Refactoring UI_ (Adam Wathan & Steve Schoger) is this repository's reference for visual
design decisions. It sits at `.aep/position/design/refactoring-ui.pdf`, with a
navigation file beside it at `.aep/position/design/refactoring-ui.md`.

**It is a reference, not a standard.** It informs a decision that is otherwise a matter of
taste; it never overrides anything this repository has decided. Where it disagrees with
[[rules/frontend]], a section above, or a context, this repository wins and the book is not
argued with — precedence is [[protocol]]'s, and a reference ranks below all of it.

### When it is opened

Open it when a change decides what a surface **looks like**:

- a new screen, panel, card, or empty state
- a redesign, or a surface being reshaped rather than rewired
- a visual complaint with no obvious cause — *it looks noisy*, *nothing stands out*, *it
  looks plain*, *the spacing feels wrong*
- a choice between two treatments that both work

**Do not open it** for wiring, data, copy, a bug with a known cause, or a change that only
moves existing markup. A reference consulted on every change is a reference nobody reads.

### How it is used

**The navigation file first, always** — `refactoring-ui.md` beside the PDF. It routes a
question to the sections that answer it, gives both page numbers each section starts at
(the PDF's and the printed one, which differ), and carries the glossary.

**Then read the pages it routed to.** The book argues through before/after images that the
text only gestures at, so a section summarised is a section unseen — the navigation file
says which pages, and those pages get opened.

**Never work from memory of the book.** Recalling that it says something about shadows is
not reading what it says; a paraphrase invented at the point of use is a guess wearing a
citation. [[protocol]] binds this everywhere, and it binds here.

**A decision that leans on it names the section** — in the comment, the commit message, or
the design document that carries the decision. "Softer icon colour to counterbalance its
weight (_Balance weight and contrast_)" is reviewable; "per Refactoring UI" is not.

### Where it is silent

The book was written for web pages in 2019. It has nothing to say about **bidirectional
layout, dark mode, motion, focus and keyboard affordances, accessibility beyond colour
contrast, desktop-window density, or text that changes length between locales** — every
one of which this application has. `refactoring-ui.md` lists them.

Those are exactly the areas this repository has already decided for itself, and its own
standards are the only home for them: **the book adds nothing to a question [[rules/frontend]]
or a section above already answers, and is not consulted on one.** A standard with two homes
drifts at one of them.

### When it is absent

The book and its navigation file are per-clone — `.aep/.gitignore` keeps the whole
`position/` directory out of version control, and a 55 MB licensed book does not belong in
a repository. So a fresh clone, another machine, and CI all have neither.

**Where the file is not there, say so and proceed on this repository's own standards.**
That is a working state, not a blocked one — this section adds a reference, and every
standard that binds a surface is committed above.
