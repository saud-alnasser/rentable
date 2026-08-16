---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: accepted
---

# feat: the work the surfaces cannot do

**The map is [#487](https://github.com/saud-alnasser/rentable/issues/487)**, and its
sub-issue list — not this file — carries live ticket state. The build tickets cut under it
are #488–#496. This repository is branch-bound, so tickets are GitHub issues rather than
files beside this spec ([[rules/tracker]]).

## Problem

The interface overhaul reached its destination: every surface is the shape its own data
and purpose call for, and no surface is left carrying idioms the rest dropped. What it did
not do — because it was never its scope — is give the application anything new to *do* with
those surfaces.

What an operator cannot do today, all of it observable without reading any code:

- **Type what the screen shows and find it.** A card renders `١٥٠٠` because numbers are
  formatted through `ar-SA`; the column holds ASCII digits and the match is a bare
  SQLite `lower()`, which is ASCII-only. So the digits on screen match nothing. Neither do
  the alef variants — a tenant stored as `احمد` is invisible to a search for `أحمد` — nor
  taa marbuta, tatweel, or any diacritic. One matching primitive serves five lists and the
  command palette, in an application whose primary locale is Arabic.
- **Work a list from the keyboard.** Three shortcuts exist, each with its own window
  listener and no shared registration, so nothing can enumerate them and no cheat-sheet can
  exist. Inside a list there is no per-record focus at all — a list is reachable by pointer
  only.
- **Narrow a list.** The list shell has carried a filter slot since it was written; one
  surface in the whole application fills it. Every other list offers search and sort and
  nothing else, and the landing screen's collected figure is pinned to the current month
  with no way to ask about another.
- **Get data in.** Every directory exports; nothing imports. The export control is a bare
  icon with no room to name a format, and the only format is CSV.
- **See what happened.** Undo is a session stack, by decision. Nothing survives a restart,
  so "what changed on this contract last week" has no answer at all.
- **Act on many records at once**, or **run an action from the palette** — the palette
  navigates and creates, and stops there.
- **Renew a contract.** The queue files contracts under a renewals rank and offers no way
  to renew one; the nearest action copies a contract rather than continuing its term.

## Goal

The application does the work its surfaces already imply: it finds what it displays,
answers the keyboard, narrows and moves its own data, remembers what was done to a record,
and continues a contract instead of only copying it.

## Constraints

- **Arabic is streamlined, not accommodated.** Both locales ship working on every ticket
  here. This effort's lead item exists precisely because that standard was met visually and
  missed underneath.
- **`design/primitive/` is a permanent fork.** A new primitive may be added through the
  CLI; an existing one is changed by hand. The flags that regenerate in place discard the
  i18n and `dir` wiring in more than thirty files, and the damage renders rather than
  erroring.
- **Two of the decisions this effort must obey rest on a premise about to be removed.**
  A separate platform effort will make a workspace a remote database shared by several
  users. ADR 0010 licenses whole result sets on the stated ground that there is no server
  and the file is local; ADR 0026 rejected a durable journal on the single ground that a
  workspace is one syncable unit whose conflicts are resolved by choosing a whole side.
  Neither ADR is wrong today. Both have their premise deleted by that effort, and
  superseding them is that effort's work, not this one's.
- **The domain model is not reopened.** Contract statuses, payment rules and the identity
  forms stand. Renewal produces a contract through the existing rules rather than changing
  them.

## Architecture

Four of the nine tickets are entirely inside the webview and are unaffected by anything the
platform effort does: the shortcut registry and the sheet that reads it, keyboard reach into
a list, verbs in the palette, and selection within a list. They touch the design system and
the shell and no persistence at all.

**Search normalization is one function with two sides.** The matching primitive already
serves every list router and the palette's record search, and it is the only place a
comparison is built. Normalizing there covers all of them at once — but a normalized
pattern only matches a normalized column, so the stored side has to be normalized too. The
seam is therefore the primitive plus whatever produces the comparable form of a stored
value; both halves are persistence's, and both stay in SQLite, which is the reason this item
survives the platform change intact.

**Filters are a vocabulary the concept declares and the shell positions.** The block already
owns the position — the slot exists and is documented as "the block gives the position and
the concept gives the control." What is missing is the other half: a declaration a list makes
about which filters it offers, carried into the read as narrowing rather than applied to a
loaded set. The shared period the landing figures and the ledger both want is one member of
that vocabulary, not a second mechanism.

**Import and export are one seam with two directions.** Export today reaches the filesystem
through Rust; import needs a reader, a validation pass, and a preview the user confirms
before a single row is written — and the set-collision problem is the one already solved
when a complex is created with its units, since a batch is built before any of it runs and
cannot branch on its own results. The toolbar control becomes a menu because a menu has room
to name a direction and a format where a bare icon does not.

**History reads from the mutation declaration that already exists.** Every mutation states,
once and on the caller side, what it does and what reverses it. A journal is a second
consumer of that declaration rather than a new mechanism underneath the domain — which is
what keeps it from becoming the generic layer the no-repository decision rejected.

**Renewal is a contract-domain action.** It produces a successor rather than moving an
existing contract's end date: a contract's expected amount and its whole derived status
model are computed from its period, so extending a period that already has payments against
it rewrites history rather than continuing it. The successor carries the predecessor's
tenant, units, interval and cost, and starts where the predecessor ended.

## Approach

**The lead is search**, because it is the only item here that is closer to a defect than a
feature, it gates nothing, and it is untouched by the platform effort. It ships first
regardless of how the rest is sequenced.

**The registry is a prefactor and goes before what depends on it** — the cheat-sheet is its
observable outcome, and both the palette's verbs and keyboard reach into a list read the
same registration. Everything else in the set gates on nothing.

Options considered and rejected:

- **Normalizing only the search term, not the stored side.** Half the fix, and the half that
  cannot work: a normalized pattern compared against an unnormalized column matches less than
  the current behaviour does, not more.
- **A collation or an extension function in SQLite.** The engine is compiled into the binary
  and the driver owns that; reaching for a custom collation puts a matching rule in the layer
  the schema module is meant to be the single description of, and it does not travel to a
  test transport that runs under Node.
- **Client-side filtering for the new filter vocabulary.** Directly against ADR 0010's
  consequence that a loaded set is never re-filtered on the client. Rejected without
  argument; it is named here only so it is not re-proposed.
- **Extending the mutation declaration down into the routers** so a journal writes itself.
  That is the repository layer ADR 0002 rejected, arriving by another road. The journal reads
  the declaration from where it already sits.
- **Renewal as an edit to the contract's end date.** Rejected above — it rewrites the record
  of the term actually served.

## Acceptance criteria

- Searching any list or the palette for a number as it is rendered on screen returns the
  records showing that number, in both locales.
- Searching for a name written with any alef variant, with or without diacritics or tatweel,
  returns records stored with any other spelling of the same name.
- Every keyboard shortcut in the application is listed on a sheet the user can open, and the
  sheet is generated from the shortcuts rather than written alongside them.
- A list can be moved through, opened, and searched without a pointer.
- More than one list offers a filter, and filtering changes which rows the read returns
  rather than which loaded rows are displayed.
- The landing figures and the payment ledger can be asked about the same period, and agree.
- A file exported from a directory can be imported back into it, and a file whose rows
  collide with each other is refused with the offending rows named, before anything is
  written.
- Both offered formats open in Excel with Arabic text intact.
- After restarting the application, a record shows what was done to it and when.
- A list can select several records and apply one action to all of them.
- An action can be run from the palette without navigating to the surface that owns it.
- A contract under the renewals rank can be renewed, and the result is a contract whose term
  follows the original's without altering it.

## Risks

- **Four tickets are specified against decisions the platform effort will supersede** — the
  filter narrowing, the import/export seam, the journal, and the latency assumption behind
  acting on many records at once. Detection is not needed; it is certain. What is uncertain is
  the shape of the replacement, which is why every one of those four is to be re-read against
  the platform effort's decisions before it is claimed rather than built from this document
  alone.
- **Normalizing the stored side of search touches existing rows.** A column that is
  normalized on write leaves every record written before it unmatched by exactly the query
  that is being fixed. The tenant context already carries this shape for identity numbers —
  normalized on save, repaired one record at a time, nothing corrected in bulk — and the same
  answer may not be acceptable for search, where the point is that the record is findable
  now. Found early by searching for a pre-existing record rather than a freshly written one.
- **A journal is data at rest that grows without bound.** Nothing in the application prunes
  anything today, and a workspace travels to Drive as a whole file. Detection is the workspace
  file size across a seeded run.
- **Reading xlsx is materially heavier than writing it**, and whether that reader is a
  JavaScript library or a Rust crate is an unmade architecture decision with different
  dependency, binary-size and security consequences. It is declared as a research increment on
  its ticket rather than assumed here.
- **The measured baseline is partly stale and its live half still bites.** Contract search has
  since moved into SQL, and the component its dead-code finding named is gone — but reconcile
  still reads every contract, payment, unit and assignment regardless of what a mutation
  touched, and every ticket here that writes rows pays that on each write. Bulk action pays it
  once per selected record.

## Out of scope

- **Notes, attachments, desktop reminders, printing, and first-run onboarding.** All of them
  need a domain model that does not exist — there is no free-text column and no file storage
  anywhere in the schema — and all of them mean something different once there is a server and
  a browser client. They are a separate effort, cut after the platform effort is designed.
- **Superseding ADR 0010 or ADR 0026.** Both are live and both are obeyed here. Replacing
  them belongs to the effort that removes their premises.
- **Recording contract lineage.** Renewal produces a successor; storing a link from successor
  back to predecessor is a schema change and is not required for the action to be useful.
- **Saved or shareable filter sets.** The vocabulary comes first; persisting a chosen set is a
  later question and a different one.
- **Pruning or exporting the history journal.** It is written and read here; retention policy
  is not settled by this effort.
