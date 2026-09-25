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

**The application's own surfaces converge on one shared surface.**

Starting, failing, recovering, asking which workspace to open, and reporting an unanticipated
error all take the shared surface in the design system.

*Why: these surfaces have no data of their own to take a shape from, so the reasoning that
makes the concept lists diverge does not reach them — what they have in common is the whole of
what they are.*

Recorded originally as ADR 0015, *The application's own surfaces converge, where its concepts' surfaces diverge*.

### Record surface

**A record surface is one shell with a per-concept body.**

The shell owns the chrome and the mechanism — the page frame, the back control, the action
cluster, the title area, and holding the chosen section in the address. **What a record's body
looks like stays with the module that owns the record.** A record's own fields are not one of
its sections.

*Why: the five hand-written record surfaces held a byte-identical loading state, not-found
state, and header arrangement — none of which is the shape of anybody's record.*

Recorded originally as ADR 0032, *A record surface is one shell with a per-concept body*.

### Landing screen

**The landing screen is a band of routed figures over one section of records per rank.**

**What may join it is a stated test: a figure routes somewhere, or a section holds rows.**
Anything that does neither does not belong on this screen.

*Why: a proportion written as a sentence reads worst as a sentence, and one long queue answers
*who do I chase* while leaving *how is the month going* to a strip nobody reads.*

Recorded originally as ADR 0030, *The landing screen is figures over sections, and a figure routes or a section holds rows*.

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

### Search

**Every set a person can search searches one way: `design/block/search-field.svelte`.** A leading
search glass, a wait of 250 ms after the last keystroke before the term becomes the search, and
`/` to put the cursor in the field from anywhere on the surface. The list shell draws it, the
contract's unit panes draw it, and the settings members and workspaces directories draw it, and a
set added later draws it rather than an input of its own. The key is registered by the field, so
it exists exactly where there is something to search, and it stands down while text is being
typed.

**A set drawn as a directory opens with the list shell's own bar,
`design/block/list-toolbar.svelte`**: the field at one end, and at the other the count, what
narrows the set, the order, and what acts on it, in that order. The list shell draws it above its
records and the settings directories above their cards. What a directory does not want it leaves
out: the settings directories offer no export, since a dozen accounts are not a file anybody
wants, and a workspace's own file is the transfer beneath the cards. The contract's unit panes are
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
way.** The concept hands the shell `filterOptions`, declared in `design/filter.ts`: a choice over
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
(`design/block/list-toolbar.svelte`). The concept names its orders as `sortOptions`, built from the
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
sheet.** A member and a workspace have no page of their own, so the card in the members directory
and in the workspaces directory opens the record's edit sheet on the same address
(`?section=organization&member=<id>`, `?section=workspaces&workspace=<id>`), and does nothing
else; the acts are still explicit controls on the card. Requirement 23 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]] is the precedent, and the
human accepted it at that effort's review round two on 2026-09-17.*

*Kept by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 8: the two
directories declare their acts in `organization/acts.ts` like every concept (*Record card actions*,
below), and the sheet a card opens is the organization host's, mounted in the frame. A member's or a
workspace's acts are gated on who is reading as much as on the record, so the record an act is given
carries the reader's facts beside the member or the workspace. Those facts are read in one place
(`memberReaderOf`, `toMemberActContext` and `workspaceContextOf` in `organization/acts.ts`), by the
settings area for its directories and by the command menu for its own offer, so neither can gate an
act the other does not. A member's name is part of its one edit, so the card offers *edit* and never
*rename* beside it.*

### Record card actions

**A record's acts are declared once per concept, and every surface offering them is a projection
of that declaration.** The concept writes one ordered list in `apps/desktop/src/lib/<concept>/acts.ts`,
of the `RecordAct` shape in `design/acts.ts`: each act's id, label, icon, tone, group, shortcut, and
the concept's own rules for whether it applies to a record (hidden where it does not) and whether it
is unavailable (shown, refused, with the reason). Three surfaces and the command menu read it:

| Surface | Projection |
| --- | --- |
| the card's visible control, and its context menu | `toCardActions` |
| the record page's action cluster | `toPageActions` |
| the command menu, before and after the record is named | `toPaletteActs`, `toPaletteVerbs` |

So label, icon, order, tone, shortcut and availability cannot differ between them, and a card offers
what its page offers, copy details and duplicate included. `design/tests/acts.test.ts` holds every
declared concept to it, for a record in each state it can be in.

**An act never opens a form or a dialog itself.** Its `run` asks the concept's host, mounted once in
`layout/component/frame.svelte`, which owns every form and confirmation the concept's acts open and
exposes `run(actId, record)` and `create(prefill?)` through a module store
(`contract/host.svelte.ts` is the first). A surface mounts none of them, so there is one form per
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

**An ordinary delete happens at once and offers undo.** A record whose delete removes the record
and nothing else is gone the moment the act is chosen, and the announcement it raises carries the
undo control and the line saying the undo lasts while the application is open (the declaration's
`toast.detail` in `design/mutation.ts`). Ctrl/Cmd+Z takes it back as well. There is no dialog in
front of it.

**A confirmation appears only where a delete removes more than the record, or cannot be undone.**
Each act declares which, as its `confirmation` in `design/acts.ts`: `none`, `cascade` or
`irreversible`, and every act in the `destructive` group declares one
(`design/tests/delete-and-confirm.test.ts` holds each concept to it). The host reads it through
`toDeleteStep` and opens `packages/design/src/lib/block/delete-dialog.svelte` only when the policy
asks. A record's own parts are the record: a contract's unit assignments go with it and come back
with its undo, so releasing its units is not a cascade. Today the tenant, complex, unit, payment
and contract deletes are `none`; deleting a
workspace, removing a member and locking one out are `irreversible`, which keeps the organization
host's deletes in the delete dialog. The delete dialog's button names the verb (*delete*, *remove*),
never *confirm* or *OK*.

**A refused delete is still refused, and says why.** A delete declared `none` waits on what might
refuse it before it runs; where something does (a tenant with contracts, a complex with units), the
host opens the delete dialog in its blocked state, which names what stands in the way and offers no
destructive control. The procedure refuses it either way.

**An act that is not a delete confirms in `packages/design/src/lib/block/confirm-dialog.svelte`**,
titled and labelled with its own verb: terminate, restore, end the other sessions, forget the
account, disconnect. It has no default title or button word, so a caller cannot fall back to
*delete*. Its control is destructive for an act that takes something away, and the ordinary
primary control for one that gives something back (restore).

*Why: a dialog in front of every delete is a question the reader learns to answer without reading,
which is the worst place for the one delete that really cannot be taken back. Undo answers the
ordinary case better than a question does, and a confirmation kept for the rare case is one people
still read. A terminate dialog drawn in the delete dialog's shape said "delete" to the reader in
every way but its words.*

The cost the spec accepts: undo lasts for the session, so a record deleted without a question is
lost if the application closes before it is taken back
([[efforts/832-the-interface-speaks-one-language-and-guides/spec]], *Risks*).

**A stated exception: deleting the organization is a heavy form with a password, not the delete
dialog.** It removes every workspace and everything in them, every member's way in, and every
other machine's place in the organization, and nothing puts any of it back: it is the one act in
the application that nothing undoes. So it takes the shared form surface at the heavy weight
(`organization/component/delete-organization.svelte`). Its body says what goes in the plainest
words there are, and the owner's password is the confirmation, refused on its own field when it
does not open the owner's vault (*Validation errors*). A question answered with one press is the
wrong weight for the act a reader can least afford to answer without reading.

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 11.

### Undo

**A change to a workspace's records can be taken back while the application is open, by the
announcement or by the key, and the two do one thing.** A mutation that declares an `inverse` in
`design/mutation.ts` leaves it on the session's stack (`design/inverse.ts`), and its announcement
carries *undo*. Ctrl/Cmd+Z takes back the change on top of the stack, and Ctrl/Cmd+Shift+Z or
Ctrl+Y applies it again (`design/undo-shortcut.ts`). Both are application shortcuts that stand down
in a text field, where those keys are the field's own, and the command menu offers both by name,
saying why where there is nothing to move.

- **What was taken back is announced, with the offer to apply it again**, so undo and redo answer
  each other from the same toast.
- **One offer at a time.** Only the change on top of the stack can move, so a new offer withdraws
  the one before it rather than leaving a control over somebody else's change.
- **An offer stays eight seconds**, longer than an announcement that only has to be read, because
  it also has to be decided on and reached for.
- **Switching workspace empties the stack**, and any offer on screen goes with it: an inverse is a
  statement about one database.

Every create, edit and delete of a tenant, complex, unit, contract or payment is inside undo, as
are a contract's renewal, termination, restoration and units, and every action on a selection
(*Bulk selection*, below), which is one change however many records it touched. **Two things are
outside it, by decision.** The organization's acts (members, workspaces, passwords, the
organization itself) are the shell's rather than a workspace's records; the ones that take
something away confirm instead (*Delete and confirm*). And a file imported is not taken back,
because its inverse would be a file's worth of deletions hung off a toast (`workspace/query.ts`).
The mechanism, replaying inverses through the real procedures, is [[rules/data]]'s, under *Undo*.

*Why: undo is what lets an ordinary delete skip its question (*Delete and confirm*), and it can
only carry that weight if the reader can find it the same way after every change.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 11.

### Create

**Every set a person can add to offers one create control, in one place, and one key.**

- **The control** is `design/block/create-control.svelte`, and nothing else draws a create: a
  quiet plus, its words in the tooltip and on the control, with the key beside them. It stands
  **last at the end of the bar above the records**: `design/block/list-toolbar.svelte`, which the
  list shell draws and the settings directories' tray (`organization/component/directory-tray.svelte`)
  draws too. A set
  that may not be added to right now keeps its control, refused, with its reason on hover and focus
  (*Guidance*, below); the workspaces tray puts its refusal in that place instead.
- **The key** is Ctrl or Cmd with N, an application shortcut in the registry
  (`design/create-key.ts`, registered by `layout/component/create-shortcut.svelte`). It is answered
  by the set on screen: a drawn control holds its place (`design/create-target.svelte.ts`) and the
  last one drawn answers. Where no set is on screen the key is unavailable and says why, and it is
  still taken from the webview, which would otherwise open a window. A form or confirmation standing
  over the set takes the key and opens nothing a second time.
- **The command menu** creates every concept a person can (`layout/create.ts`): tenants, complexes
  and contracts in their directory, and a unit or a payment after asking, in the menu's asking
  mode, for the complex or the contract it cannot be without.
- **Every route reaches the concept host's `create`**, and nothing else opens a create form. The
  command menu's `?create` on a directory is consumed by the host, which owns the form
  (`design/create-intent.svelte.ts`), and never by the directory.

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
  `workspace/component/directory-import-dialog.svelte`: choose the file, see what it would do, then
  agree. **Nothing is written before the last step.** The dialog says how many rows go in, how many
  do not and why, and which rows to go and look at. A row wrong on its own is turned away and the
  rest goes in; a file whose rows contradict each other is refused whole and offers no import
  (`design/import.ts`). An import is outside undo (*Undo*).

Tenants, complexes, units, contracts and payments offer both. A contract that takes no new payment
refuses the import on its ledger, with the reason its create is refused (`importUnavailable` on
the list shell), since an import only adds payments. The settings directories offer neither (*Search*).

**A whole workspace is one file, and it moves from the settings area**, beside sync
(`workspace/component/transfer.svelte`), never from a directory: a directory's control writes that
directory's records and nothing else. Its import shows a line per sheet
(`workspace/component/import-dialog.svelte`), and a reference nothing in the file answers refuses
the whole file.

*Why: the export was an icon that could say export and nothing else, so a second format had nowhere
to be named and the other direction had nowhere to go.*

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 6.

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
with its phone composite, member), and **light** otherwise (payment, unit, rename, password). So a
complex is heavy for both create and edit, and a concept never opens on two presentations.

**A member's two sheets share one layout.** The sheet that adds a member
(`organization/component/account-form.svelte`) and the sheet that edits one (`member-sheet.svelte`)
draw the same sections, in the same order, with the same legends and control shapes, from the same
pieces: the username under its head, the role in its tray (`member-role.svelte`), what a member may
do beyond their role as a list with a picker (`member-acts.svelte`), and a row per workspace with
its three levels (`member-workspaces.svelte`), where *no access* is what not granting it is. Only
the sentences that belong to the moment differ, and who may hand out what is decided in the shared
pieces, so the two cannot gate differently. *Settled by ticket 42 of
[[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the human saw the two side by
side in the running build, the add sheet drawing an uppercase label, seven checkboxes and a checkbox
per workspace, and asked for it to read like the edit sheet.*

**A submit is labelled with its verb, and carries the verb's glyph before the label.** Every submit
does, the domain forms' as well as the organization's and the startup screens': *create* takes the
plus, *save* and *update* the save glyph, and an act's own verb takes the glyph its act declares
(renew, the calendar with a plus). One convention, and it is *all*, because the primaries of
[[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]] (requirement 14) already
carried theirs.

**A refused submit moves focus to the first invalid field**, in the order the reader meets them,
and scrolls it into view inside the surface's own body. Enter submits. Every schema form spreads
`surfaceForm` from `apps/desktop/src/lib/design/form.ts` into its `superForm` call, which is where
both are set; `tenant/tests/form.svelte.test.ts` holds the focus.

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 10: complex
was heavy on create and light on edit, and the domain submits carried no glyph where the
organization's did.

### Field kinds

**Each kind of value takes one control**, in a form and on a record alike:

| Value | Control |
| --- | --- |
| a choice of two to four, exclusive | toggle group |
| a setting that takes effect at once | switch |
| a choice of five or more | select, or a combobox when searched |
| another record | combobox over its search |
| a date | the popover calendar, given the reader's locale |
| money | the input group with the riyal sign as adornment, `inputmode="decimal"` |
| a phone | country select plus number, `dir="ltr"` |
| a status | the status icon cell |
| a count | the count cell |

**No form uses a select for a choice of four or fewer.** Such a choice is a toggle group, the
chosen segment pressed: the contract's cycle (four), a member's role (two), a workspace's access
(two or three) and the language (two), as the appearance (three) already was. A segment carries a
label and at most an icon, so where an option needs a sentence, the sentence of the option chosen
stands under the control, as a role's *who it is for* and an access level's *what it is good for*
do on the member's sheet. An option the reader may not choose is drawn refused on its segment,
never removed, exactly as it was in the menu. `design/tests/few-options.test.ts` fails on a
`Select` whose written options number four or fewer, and on one drawn from a list that its
allowlist does not explain as more than a few. The one select the map itself names, a phone's
country half, stays one: its list is the countries the application can dial, and grows as they are
added.

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
binds every surface showing a status, and every status in the vocabulary of nine carries a
description.

*Why: the row stops spending width on a word most readers recognise by position, and the reader
who does not recognise it gets a full sentence rather than a single word.*

Recorded originally as ADR 0023, *A status is an icon, and its word lives in the tooltip*.

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
*owing* alone (`isMoneyRank` in `contract/rank.ts`), and a due-soon heading carries no total. Every
list that filters by rank offers it. Settled by
[[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 11.

## Loading and feedback

### Loading

**A surface waiting on its content draws `packages/design/src/lib/block/loading.svelte`, and
nothing else.** The surface hands in a snippet drawing the shape of what is on its way (a list's
cards, a record's header, the settings area's rail and fields, the dashboard's sections) from the
skeleton primitive. The block decides when that shape appears: **not before 200 ms, and once shown,
for at least 300 ms.** A load that settles inside the delay draws no skeleton at all. Until then the
region is empty and marked busy, and the skeleton, once it is up, is a status carrying the
surface's own loading sentence.

No surface draws a spinner in place of its content. **The startup progress bar is not a load and
stays as it is**, because it reports the stages of starting rather than waiting on one read. A
spinner inside a control that is working (a pressed submit, the toaster's own) is a control's state
and is not what this governs.

*Why: loading had several treatments and no two agreed, and a spinner says only that something is
happening. A shape says what is coming and where it will be, and the delay and the hold keep a
fast local read from flashing a skeleton for a frame.*

### Empty

**A region with nothing to show draws `packages/design/src/lib/block/empty.svelte`, and nothing
else**: a title, an optional line under it, and one act beneath both. The block names no concept
and reads no words from the string contract; every sentence is the caller's. It says which of
three situations it is, on `data-empty`, and the three never read the same:

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

- **An act refused or failed** is an error toast, raised by the mutation's declaration or through
  `error/toast.ts` (*Feedback*, below). Its title is the reader's sentence, read from the refusal's
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
  (`layout/component/caught-error.svelte`). It offers *retry*, which draws the screen again, and
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
the handlers in `design/mutation.ts`; anything else, a failure raised outside a mutation or a
success nothing declared, goes through `error/toast.ts`. Those two modules are the only importers
of `toast`, and `error/tests/toast-reach.test.ts` fails on a third. [[rules/frontend]] states the
same line for mutations under *Data access*.

**A notice that stands on a surface is a callout**, drawn with the callout primitive in the tone
vocabulary above, never a hand-coloured box. The contract units lock notice is the worked example:
`info`, because a locked contract is working as it should.

**Notifying is these two and nothing else.** The application tells the reader something through a
toast, raised through the shared handlers, or through a callout standing on the surface it is
about; it raises no system notification. A toast is read and gone in the toaster's shared
duration, and one carrying an offer stays longer (*Undo*).

Settled by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement 12.

## Navigation

### The breadcrumb

**The trail is built from the page's route id, and every crumb is a page.** `layout/navigation.ts`
lists the pages and the places the trail names (the four directories and the settings area); a
prefix of the route id is a crumb only where it is one of those places. An address segment is not a
place: a unit's address passes through `/complexes/units`, and no page lives there.
`layout/tests/navigation.test.ts` asks every page's trail against the routes directory itself.

**A record's page ends the trail on the record, by name.** The record surface says what the record
it shows is called (`shown-record.svelte.ts` in the design package), because only the concept
knows: a contract is named by its tenant. A record reached through another runs its trail through
that one: a payment's trail is its directory, its contract, then the payment
(`RECORD_PARENTS` in `layout/navigation.ts`), and the record surface names and addresses the
contract as its `parent`. Until the record is read the trail ends on the directory
above it, and a record that is not there is named as unknown. The dashboard and the way in carry no
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
  focus on its card, through `design/landing.svelte.ts`. The host names the record and the list
  block answers where it shows it: it scrolls the record into view and puts the focus on it once
  the form has gone, through the same request an arrow key raises, so the keyboard carries on from
  the new record. Each list on screen answers the request once, from the set it holds, and the next
  navigation drops it, so a set opened later or a filter cleared later never moves the focus
  (`design/tests/landing.svelte.test.ts`).

### An act that cannot run says why at the control

**An act that does not apply to a record is hidden; an act that applies and cannot run now is
shown, dimmed, refused, and says why in one line on hover and focus.** The reason is the act's
`unavailable` (`design/acts.ts`), and every surface draws it from the one declaration: the card's
two menus (`record-card.svelte`), the record page's cluster (`record-action-control.svelte`), and
the create control (`create-control.svelte`, given the set's reason by the list's
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
argued with — precedence is [[policies/authority]]'s, and a reference ranks below all of it.

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
citation. [[policies/engineering]] binds this everywhere, and it binds here.

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
