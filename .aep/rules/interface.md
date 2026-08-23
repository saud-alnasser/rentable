---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: rule
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
the result count, and the create action. The module that owns the data supplies a snippet
saying what one record looks like.

*Why: the five lists are not five of a kind — payments are an account statement, units an
occupancy board, contracts a triage queue, tenants and complexes directories searched rather
than browsed — and one uniform table fits none of them.*

Recorded originally as ADR 0013, *Each list gets the presentation its data is shaped like, over one shared shell*.

### Row activation

**A row opens its record's page, everywhere, and does nothing else.**

A row-level action is an explicit control on the row, never the row itself. Every record a row
can show therefore has a page to open, payments included.

*Why: a click that means three different things depending on the surface asks the reader to
know which surface they are on before they know what will happen.*

Recorded originally as ADR 0025, *A row opens its record, and does nothing else*.

### Record card actions

**A record card offers its actions from a visible control and from the context gesture.**

One block owns the card's markup, so a surface inherits both routes instead of choosing.
**The two routes are not equals, and the asymmetry is the rule:** the visible tertiary control
is what the card promises and holds every action, reachable by pointer and by keyboard; the
context gesture is derived from the same list and may hold nothing the control does not.

*Why: a gesture-only card promises nothing, and keyboard users reach no action at all.*

Recorded originally as ADR 0034, *A record card carries its actions twice, and one block owns both routes*.

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

**A contract's units are transferred on the tab that lists them.**

The tab holds both panes and performs the transfer itself. There is no assignment dialog and no
create control standing in for one.

*Why: a `+` promises to add a unit, and what it opened chose the contract's whole set in both
directions — the only way into the surface described a different operation than the surface
performed.*

Recorded originally as ADR 0029, *A contract's units are transferred on the tab that shows them*.

### Attention rank

**A contract's attention rank is derived in the contract domain.**

Overdue, behind, and ending soon are decided from a contract's status, end date, and what it
owes today — so the rules live with the contract. The dashboard reads the rank; it never
derives one.

*Why: they were rules about a contract living in a module named for the surface that happened
to read them first, which is why the contracts list could not filter by rank.*

Recorded originally as ADR 0031, *A contract's attention rank is the contract's own*.

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
