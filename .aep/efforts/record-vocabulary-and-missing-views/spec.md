---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: implemented
---

# feat: records read as shapes, and the views they lead to exist

## Problem

**The surfaces are consistent in mechanism and inconsistent in what they say.** One list shell
serves five presentations, one form surface serves five forms, and one cell module holds the
treatments they share — that structure is settled and is not what is wrong. What is wrong is
that the vocabulary rendered through it is thin, and thinnest exactly where the reader is
scanning fastest.

- **A status is a word in a badge.** Nine of them, in three places, and the description that
  says what a status *means* is written in the codebase only for contracts and shown in only
  one place — a detail header nobody reaches while scanning. A reader working a list is
  reading prose at a glance rate.
- **A count is an icon with no name.** A directory row carries a door, a dashed circle, a
  contract glyph. Each has an accessible label and none has a tooltip, so the meaning is
  available to a screen reader and to nobody using a pointer.
- **The one number on a contract row is the wrong one for scanning.** It shows the cost per
  interval. What the reader wants at a glance is how far through paying the contract is, and
  the two figures that answer it are already materialized on the row and rendered nowhere.
- **A contract row shows no sign of how much has been recorded against it.** Whether a
  contract has one payment or thirty is invisible until the ledger is opened.

**Two views the data implies do not exist.** A tenant holds contracts and their profile cannot
show them. A unit is mentioned by contracts and there is no unit view at all — the route that
would hold one redirects to the complex's units tab instead.

**One concept reads two ways depending on which tab you opened.** Units are an occupancy board
inside a complex and bespoke assignment cards inside a contract, and neither is the directory
the other record surfaces use.

**Clicking a record means three different things.** A directory row opens the record's page, a
work-queue row in a money group opens the payment form with the contract already chosen, and a
ledger line does nothing at all. Each divergence was argued locally and none was argued against
the others, so the reader has to know which surface they are on before they know what a click
will do.

**Four of the five forms are plainer than the fifth for no reason a reader can see.** The
contract form cuts its controls into the surface and pins a read-out of what the record will
be above the fields deciding it. The other four put default controls in a bordered box. The
difference is not a decision; it is where the work stopped.

## Goal

One visual vocabulary — status as an icon, a count as a named icon, money as a fill — used
identically wherever a record is shown; a tenant and a unit each reach the contracts that
concern them; units read as a directory everywhere; and every form has the interior the
contract form has.

## Constraints

- **The status set is nine, not six.** The shared status treatment spans the six contract
  statuses plus `occupied`, `vacant`, and `overdue`. Descriptions exist for the six; the other
  three need writing, in both locales.
- **Descriptions are already written for contracts and are not re-authored.** They are shown in
  one place today; this work moves them into the shared treatment rather than composing new
  wording, and the contract detail header's duplicate status map goes with it.
- **A hover-only meaning must survive the surfaces that suppress hover.** The work queue's row
  is a click target laid over content that disables pointer events, so a tooltip there does not
  fire unless the status is exempted the way the phone already is.
- **Arabic is first-class.** Every surface here ships working in both directions. A fill that
  runs from the physical left is broken in Arabic, and the shared progress primitive already
  states why it fills by width rather than by transform.
- **Motion responds or does not happen** (ADR 0016,
  ADR 0021). A ring
  that fills when its data arrives is a trigger and may animate; one that fills on a timer is a
  loop and may not.
- **One bounded query per state** ([[rules/list-reads]]).
  The three new reads filter and count in SQL. Nothing loads a set to narrow it in the browser.
- **A count rides the list query it belongs to.** Two aggregates already do this — contracts in
  force per tenant, units and vacancies per complex — and a payment count follows them rather
  than becoming a query per row.
- **Reconcile owns the derived columns.** The fill reads the materialized paid and expected
  amounts ([[rules/payment-aggregates]]); nothing here
  recomputes a status or an aggregate at render time.
- **Forms keep the shared surface and the field layer**
  ([[rules/form-surface]]). Weight, presentation,
  formsnap, superforms and zod are untouched; only the interior changes.
- **Generated primitives are edited by hand, never regenerated**
  (ADR 0007). A genuinely new primitive may
  be added through the CLI; no existing one is replaced.

## Architecture

**The cell module becomes the vocabulary, and it grows three treatments.**

*Status* stops being a word and becomes an icon carrying its own description. One glyph per
status, one variant per meaning as today, and the translated name and description reach the
reader through a tooltip and an accessible label rather than through visible text. Every
surface showing a status — the contract directory, the occupancy rows, the work queue, and the
three detail headers — renders the same treatment, which is what removes the detail header's
private copy of the status map.

*A count* becomes a named icon: glyph, figure, and a tooltip saying which quantity it is. The
directory rows that already carry counts adopt it, and a contract row gains one for its
payments.

*Money as progress* becomes a ring: payments received against the contract's total cost — the
two materialized columns, not amount due, because the ring answers *how close to paid in full*
and amount due answers a different question the row is not asking. **The ring carries its own
figure**: the percentage sits at its centre, and the amounts and the per-interval cost move into
its tooltip. The bare ring was the specified treatment and lost to this one when both were
looked at ([[efforts/record-vocabulary-and-missing-views/evidence/prototypes/status-glyphs-and-the-payment-ring]]) — an arc with a
number at its centre is not the shape any loading indicator takes, which is what the recorded
spinner risk turned on.

**Two read surfaces are added, and they share one record.** The contract row rendered by the
contracts directory becomes a component three surfaces render — the directory, a tenant's
contracts tab, and a unit's contracts tab — so a contract looks the same wherever it is met and
navigates to its own view from all three. Behind them, the contract read gains a tenant filter
and a unit filter; both narrow in SQL.

**A unit gets a view of its own.** The route that redirects today stops redirecting and holds
an information tab and a contracts tab, reached from the complex's units directory. It needs a
single-unit read that carries the complex the unit belongs to — the read that exists returns a
collection and no complex name.

**Units converge on the directory, and assigning them becomes a write surface.** The occupancy
board and the assignment cards both become directory rows, which puts the concept's read shape
in one place. Assignment stops being a panel embedded in a read surface and becomes a form on
the shared form surface — which is what
[[rules/surface-kinds]] already predicts for
a surface that writes, and what leaves the contract's units tab a directory and nothing else.

**A row opens its record and does nothing else**
([[rules/row-activation]]). Three surfaces
move to reach it: a unit row gains the view it can open, a ledger line gains one — a payment
becomes a record with a page, which it has never been — and a queue row stops opening the
payment form. A row-level action survives as an explicit control on the row rather than as the
row itself.

**The form interior becomes shared.** The control treatment the contract form defines privately
moves into the design system and is applied to all five. The pinned read-out moves with it but
is applied only where a form has something to say that its fields do not already say — a
tenant's identity and phone, a payment against what the contract still owes. A complex is a
name and a location and a unit is a name; a panel restating a field two lines above it is
decoration, and the standing rule for this effort is that elegance means removing decoration.

**The unbounded tenant read is closed here.** Opening the contract form reads every tenant to
filter twenty in the browser. [[efforts/ui-overhaul/evidence/research/interface-performance-baseline]]
measured it, [[rules/list-reads]] explicitly declined
to license it and parked it as a form question, and this is the effort that owns the forms. The
picker narrows in SQL against a bounded limit the read already accepts.

## Approach

**The vocabulary first, because six surfaces consume it, then the views, then the forms.** The
status treatment leads: it touches the most surfaces, it is the one whose failure mode is
subjective, and every later ticket renders it.

**The two questions that could not be answered from a description were answered before any
ticket was cut**, in one prototype session against real rows, so no ticket here carries an
increment: [[efforts/record-vocabulary-and-missing-views/evidence/prototypes/status-glyphs-and-the-payment-ring]]. Its two
limitations bind the tickets that inherit them — the glyphs were judged on the contracts
directory and never at unit-tile density, and neither treatment was seen in Arabic.

**The unit sequence is a chain and the rest is not.** A unit view must exist before the
complex's units can navigate to one, and the units directory record must exist before the
contract's units tab can adopt it. Everything else — the count tooltips, the ring, the tenant's
contracts tab, the form interior, the tenant read — is independent and ordered only by taste.

### The tickets

Cut under one root, *feat: give the record surfaces one vocabulary and the views they are
missing*. Every ticket below is `Part of` it.

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| 01 | feat(design): every status reads as an icon that names itself | — | the nine glyphs the prototype settled, three new descriptions, both locales; the detail header's private status map comes out |
| 02 | feat(design): a count icon names the quantity it counts | — | the named-count treatment on the tenant, complex and contract rows; the payment-count aggregate on the contract read |
| 03 | feat(contract): a contract row shows what it has been paid as a ring | — (related: 02) | the ring with its percentage at the centre; the amounts and the per-interval cost move into its tooltip |
| 04 | feat(tenant): a tenant profile lists the contracts it holds | — | tabs on the profile; the tenant filter on the contract read; the contract row becomes the component three surfaces render |
| 05 | feat(complex): a unit has its own view | 04 | the route stops redirecting; information and contracts tabs; the single-unit read carrying its complex, and the contracts-for-unit read |
| 06 | feat(complex): a complex lists its units as a directory | 05 | the occupancy board becomes directory rows that navigate to the unit view; occupancy and the occupying tenant survive the move |
| 07 | feat(contract): assigning units is a form, and a contract lists its units as a directory | 06 | assignment moves onto the shared form surface; the assigned list becomes 06's row; the lock rules stay in the contract module |
| 08 | feat(design): a form cuts its controls into the surface | — | the control treatment promoted out of the contract form and applied to all five; the pinned read-out on tenant and payment only |
| 09 | fix(contract): the contract form stops reading every tenant | — (related: 08) | the picker narrows in SQL against the bounded limit the read already accepts |
| 10 | feat(payment): a payment has its own view | — | the route, the single-payment read, the view, and the ledger line opening it |
| 11 | refactor(dashboard): a queue row opens its contract | — | the payment-form row action comes out; the queue conforms to ADR 0025 whatever the screen later becomes |

Everything except one chain gates on nothing. `04 → 05 → 06 → 07` is that chain, and each edge in
it is a real gate: 05 renders the record 04 extracts, 06 navigates to the view 05 builds, and 07
adopts the row 06 establishes.

Ticket 11 is deliberately separable from what the landing screen becomes. Its change is the one
part of the screen ADR 0025 settles, and the row was going to navigate under any shape the
screen takes — so it is not work thrown away if the screen is later rebuilt.

### Considered and rejected

- **Icon plus text for statuses.** Legible without hover and scannable without training, and
  rejected on the request: it is not "instead of the status". The cost accepted with it is that
  a status is unreadable to a pointer user until hovered, and unreachable to a touch user
  altogether — bounded by the fact that this application has no touch input.
- **Icon in lists, icon and text in detail views.** Rejected: the same status would look
  different in two places, which the one-treatment-everywhere rule was written against.
- **The ring beside the cost figure rather than instead of it.** Safest and most legible, and
  rejected as the least like what was asked for. The consequence accepted is that the cost sort
  orders on a figure the row no longer shows — the row does still state a number, but a
  percentage rather than an amount.
- **The bare ring, with every figure on hover.** This spec's own first answer, and rejected on
  looking against the one that carries its percentage.
- **A treatment that is not an arc at all** — segments filling in reading order — built as the
  fallback if the arc read as a spinner. Not needed, and recorded so it is not re-proposed.
- **A directory in the complex's units tab only.** Rejected: it leaves a unit reading two ways
  depending on which tab was opened, which is the divergence this work exists to remove.
- **Assignment kept as an inline panel.** Rejected with the directory decision: a panel that
  writes, embedded in a surface that reads, is the case ADR 0020 draws its line through.
- **A summary panel on all five forms.** Rejected: on a complex and a unit it restates the
  fields immediately below it.

## Acceptance criteria

- Every status in the application renders as an icon with no visible word, and hovering it names
  the status and says what it means — in both locales, including inside the work queue's rows.
- The nine statuses are visually distinguishable from one another at the size a directory row
  renders them.
- Every count icon in every directory names its quantity on hover, and a contract row carries
  the number of payments recorded against it.
- A contract row shows how much of the contract has been paid as a filled ring with the
  percentage at its centre, and hovering it gives the amount paid, the total cost, and the cost
  per interval.
- Each of the nine statuses renders as its own icon, and the two pairs that differ only by
  whether the contract is paid in full are told apart by one consistent mark rather than by two
  unrelated pictures.
- A tenant's profile lists every contract that tenant holds, and opening one reaches the same
  contract view the contracts directory reaches.
- A unit has a view with its information and the contracts that mention it, reached from its
  complex, and opening one of those contracts reaches the contract view.
- Units read as directory rows in both the complex's units tab and the contract's units tab, and
  the two rows are the same row.
- Assigning units to a contract happens on the shared form surface, and the rules that lock
  assignment — a terminated contract, a contract with a payment recorded — still refuse it and
  still say why.
- Every form's controls are cut into the surface, and the tenant and payment forms carry a
  pinned read-out; the complex and unit forms carry none.
- Opening the contract form does not read the whole tenant table.
- Clicking any record anywhere opens that record's own page — a contract, a tenant, a complex, a
  unit and a payment alike — and no row's click does anything else.
- A payment has a page showing what it was, when, and against which contract, reached from the
  ledger line.
- Every surface touched holds from 640×480 upward, in English and Arabic, LTR and RTL.

## Risks

- **Nine icons is more meaning than nine glyphs can carry.** Six contract statuses include two
  pairs that differ only by whether the contract is paid — the vocabulary has to distinguish
  them without a word. Detected by the declared increment on the status ticket: the glyphs go on
  screen against real rows before that ticket commits, and the fallback is the icon-and-text
  option this spec rejected, which is one prop rather than a redesign.
- **A hover-only status is invisible to a reader who does not hover.** Accepted deliberately.
  Detected if it bites — the tooltip mechanism stays, so restoring the word is additive.
- **The ring reads as a spinner.** A filled arc on a row is the shape a loading indicator takes.
  Detected by the increment on the ring ticket; mitigated by it never animating except when its
  data arrives.
- **Assignment as a form loses a rule.** The current panel encodes when assignment is locked and
  what to say about it in three places at once. Moving it is where a rule gets dropped silently.
  Detected by the router's own tests, which already cover the refusals end to end — the rules
  live in the contract module and the form is a caller like any other.
- **The units directory is a shape regression.** The occupancy board was chosen deliberately
  over a directory once. Detected by looking, as it was the first time.
- **The form interior becomes a per-form prop.** The same risk the form surface already carries
  and the same detection: a treatment that serves exactly one form means the axis is wrong, and
  it comes back here rather than becoming a flag.

## Out of scope

- **The domain model.** No status is added, removed or redefined; no rule about assignment,
  termination or payment changes. The three missing status descriptions describe what is already
  true.
- **The schema.** Every figure this work shows is a column that exists or a count taken on a
  list query. No migration.
- **The landing screen's shape.** It renders the new status treatment and its rows navigate, and
  nothing else about it moves here. What it becomes is genuinely open — ADR 0025 voided the one
  argument that held it as a queue, and the grill that reopened it ended without a decision. The
  record is the discussion that parked the dashboard after the queue lost its action, and it is a
  look-and-behave question, so it wants something to react to rather than another spec.
- **Collapsible groups.** Asked for, and set aside rather than refused: their benefit is making
  one long grouped queue scannable, and whether there is still one long grouped queue is the
  question above. Deciding this before that one builds shell machinery the screen may not need.
- **The payment ledger's shape.** It adopts the status vocabulary it shows and stays a statement.
- **Sort and search vocabularies.** No list gains or loses a sort key, and dropping the cost
  figure from a contract row does not drop cost from its sort options or from search.
- **The field layer of forms.** formsnap, superforms and zod are untouched, as they were when the
  form surface landed.
- **Pagination.** ADR 0010 holds; the two new reads are whole result sets like every other.
