---
status: implemented
---

**The map is [#487](https://github.com/saud-alnasser/rentable/issues/487)**, and its
sub-issue list — not this file — carries live ticket state. The build tickets cut under it
are #488–#496, #514 and #515. This repository is branch-bound, so tickets are GitHub issues
rather than files beside this spec ([[rules/tracker]]).

*Tasks re-derived 2026-08-17. Two tickets were each carrying two acceptance criteria and two
observable outcomes, and were split at the criterion boundary: the shared period left #492 as
**#514**, and import left #494 as **#515**. Nothing was added to scope and nothing removed —
the twelve criteria below are unchanged, and only which ticket answers each one moved. The
same pass rewrote every path here for the monorepo (#499) and corrected the Architecture's
claim that the matching comparison is written in one place.*

*Reshaped to the 2.x spec template on 2026-08-17. The Problem, Goal, Constraints,
Architecture, Approach, Acceptance Criteria, Risks and Out of Scope carried over with their
wording intact. **Scope**, **Requirements**, **Testing Strategy** and **Components** are
derived — each is stated from material already in this file, and neither adds nor removes
scope. Three ADR references were repaired to the rules that replaced them.*

# Problem

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
- **See what happened.** Undo is a session stack, by decision ([[rules/data]], under *Undo*). Nothing
  survives a restart, so "what changed on this contract last week" has no answer at all.
- **Act on many records at once**, or **run an action from the palette** — the palette
  navigates and creates, and stops there.
- **Renew a contract.** The queue files contracts under a renewals rank and offers no way
  to renew one; the nearest action copies a contract rather than continuing its term.

# Goal

The application does the work its surfaces already imply: it finds what it displays,
answers the keyboard, narrows and moves its own data, remembers what was done to a record,
and continues a contract instead of only copying it.

# Scope

*Derived 2026-08-17 from the Problem's seven items and the ticket set they were cut into.*

- **Search matching, on both sides.** The matching primitive that serves five lists and the
  palette, and whatever produces the comparable form of a stored value.
- **Keyboard operation.** A shared shortcut registry, the sheet generated from it, and
  per-record focus inside a list.
- **List narrowing.** A filter vocabulary a concept declares and the shell positions, carried
  into the read — and the shared period the landing figures and the ledger both want.
- **Data in and out.** An import path with validation and a confirmed preview, and the export
  control becoming a menu with room to name a direction and a format.
- **A durable record history**, read from the mutation declaration that already exists.
- **Acting on many records at once**, and **running an action from the palette**.
- **Contract renewal**, producing a successor through the existing domain rules.

# Requirements

*Derived 2026-08-17. Each is the corresponding acceptance criterion stated as an obligation;
the criteria were the only statement of intent this spec previously carried.*

1. Search matches numerals as they are rendered on screen, in both locales.
2. Search matches an Arabic name across orthographic variation — alef forms, diacritics,
   tatweel, taa marbuta.
3. Every keyboard shortcut in the application is enumerable, and the sheet the user opens is
   generated from that registration rather than maintained beside it.
4. A list is fully operable from the keyboard — moved through, opened, and searched.
5. More than one list offers a filter, and filtering narrows the read rather than the loaded
   set.
6. The landing figures and the payment ledger answer about one shared period vocabulary.
7. A file exported from a directory imports back into it, and a file whose rows collide is
   refused — naming the offending rows — before anything is written.
8. Both offered export formats open in Excel with Arabic text intact.
9. A record's history survives a restart.
10. A list selects several records and applies one action to all of them.
11. An action runs from the palette without navigating to the surface that owns it.
12. A contract under the renewals rank is renewed into a successor whose term follows the
    original's without altering it.

# Acceptance Criteria

Numbered 2026-08-17 to trace against the requirements above; wording otherwise unchanged.

1. Searching any list or the palette for a number as it is rendered on screen returns the
   records showing that number, in both locales. *(R1 — #488)*
2. Searching for a name written with any alef variant, with or without diacritics or tatweel,
   returns records stored with any other spelling of the same name. *(R2 — #488)*
3. Every keyboard shortcut in the application is listed on a sheet the user can open, and the
   sheet is generated from the shortcuts rather than written alongside them. *(R3 — #489)*
4. A list can be moved through, opened, and searched without a pointer. *(R4 — #490)*
5. More than one list offers a filter, and filtering changes which rows the read returns
   rather than which loaded rows are displayed. *(R5 — #492)*
6. The landing figures and the payment ledger can be asked about the same period, and agree.
   *(R6 — #514)*
7. A file exported from a directory can be imported back into it, and a file whose rows
   collide with each other is refused with the offending rows named, before anything is
   written. *(R7 — #515)*
8. Both offered formats open in Excel with Arabic text intact. *(R8 — #494)*
9. After restarting the application, a record shows what was done to it and when. *(R9 — #495)*
10. A list can select several records and apply one action to all of them. *(R10 — #493)*
11. An action can be run from the palette without navigating to the surface that owns it.
    *(R11 — #491)*
12. A contract under the renewals rank can be renewed, and the result is a contract whose term
    follows the original's without altering it. *(R12 — #496)*

# Constraints

- **Arabic is streamlined, not accommodated.** Both locales ship working on every ticket
  here. This effort's lead item exists precisely because that standard was met visually and
  missed underneath.
- **`design/primitive/` is a permanent fork.** A new primitive may be added through the
  CLI; an existing one is changed by hand. The flags that regenerate in place discard the
  i18n and `dir` wiring in more than thirty files, and the damage renders rather than
  erroring.
- **Two of the decisions this effort must obey rest on a premise about to be removed.**
  A separate platform effort ([[efforts/a-workspace-follows-its-user/spec]]) will make a
  workspace a remote database shared by several users. [[rules/data]], under *List reads*, licenses whole
  result sets on the stated ground that there is no server and the file is local;
  [[rules/data]], under *Undo*, rejected a durable journal on the single ground that a workspace is one
  syncable unit whose conflicts are resolved by choosing a whole side. Neither rule is wrong
  today. Both have their premise deleted by that effort, and superseding them is that
  effort's work — its decision 09 — not this one's.
- **The domain model is not reopened.** Contract statuses, payment rules and the identity
  forms stand. Renewal produces a contract through the existing rules rather than changing
  them.

# Out of Scope

- **Notes, attachments, desktop reminders, printing, and first-run onboarding.** All of them
  need a domain model that does not exist — there is no free-text column and no file storage
  anywhere in the schema — and all of them mean something different once there is a server and
  a browser client. They are a separate effort, cut after the platform effort is designed.
- **Superseding [[rules/data]], under *List reads*, or [[rules/data]], under *Undo*.** Both are live and both are obeyed
  here. Replacing them belongs to the effort that removes their premises.
- **Recording contract lineage.** Renewal produces a successor; storing a link from successor
  back to predecessor is a schema change and is not required for the action to be useful.
- **Saved or shareable filter sets.** The vocabulary comes first; persisting a chosen set is a
  later question and a different one.
- **Pruning or exporting the history journal.** It is written and read here; retention policy
  is not settled by this effort.

# Risks

- **Four tickets are specified against decisions the platform effort will supersede** — the
  filter narrowing (#492), the latency assumption behind acting on many records at once
  (#493), the import/export seam (#494), and the journal (#495). Detection is not needed; it
  is certain. What is uncertain is the shape of the replacement, which is why every one of
  those four is to be re-read against the platform effort's decisions before it is claimed
  rather than built from this document alone. **All four now carry that dependency as a
  blocking edge on the tracker**, recorded 2026-08-17 — #495's was missing until then. The
  two tickets split out of that set on the same day, #514 and #515, inherit the warning
  through the ticket each waits on.
- **A blocking edge is only as honest as the issue it points at.** #497 — the platform
  effort's map, and the blocker all four of those tickets name — was closed on 2026-08-17 by
  a documentation pull request whose body carried `Closes #497`, while the effort itself was
  merely accepted. For the rest of that day the four read as unblocked on the tracker with
  their premise untouched. **Reopened by the same `/tasks` pass that found it.** The failure
  mode is cheap to repeat and silent: a closing keyword in a pull request body closes a map
  the merge did not deliver ([[references/github]] carries the constraint).

# Architecture

Four of the nine tickets are entirely inside the webview and are unaffected by anything the
platform effort does: the shortcut registry and the sheet that reads it, keyboard reach into
a list, verbs in the palette, and selection within a list. They touch the design system and
the shell and no persistence at all.

**Search normalization is one function with two sides.** ~~The matching primitive already
serves every list router and the palette's record search, and it is the only place a
comparison is built.~~ **Corrected 2026-08-17 against the tree: it is not.** The same
`lower(cast(… as text)) like lower(?) escape '\'` is written out three times — in
`platform/database/search.ts`, as `contractSearchCondition` in `contract/router.ts`, and as
`paymentSearchCondition` in `payment/router.ts`. The decision is untouched by that, because
it never rested on the count: normalize at the comparison, on both sides, in SQLite. What
changes is the size of the seam — three call sites, which #488 either converges onto one or
normalizes three times and says so. Normalizing one of the three fixes one of the three while
reading as fixed, which is the failure this correction exists to prevent. A normalized
pattern only matches a normalized column, so the stored side has to be normalized too. The
seam is therefore the primitive plus whatever produces the comparable form of a stored
value; both halves are persistence's, and both stay in SQLite, which is the reason this item
survives the platform change intact.

**Which columns fold is the schema's answer, not the call site's** *(added 2026-08-17, from
[[efforts/work-the-surfaces-cannot-do/evidence/prototypes/what-the-folded-search-actually-costs]])*.
Folding every searched column on the stored side is mostly identity work: seven of the twelve
are ASCII **by validation rather than by convention** — `identity` and `phone` are anchored
patterns that no Arabic-Indic digit satisfies, `status` and `interval` are enums, `cost`,
`amount` and `tenant_id` are numeric, and the ledger's day is a computed `strftime()`
expression rather than a column at all. So a searchable column **declares whether its stored
side can hold a substitutable character**, the declaration sits beside the column in the
schema module, and the comparison reads it. The **term folds always** — that is what makes a
search typed in Arabic-Indic digits find a row stored in ASCII ones, and it is the half that
must never be conditional.

*Why the declaration is not a new invariant to keep: for every column declared ASCII the
field validator already refuses anything else, so the declaration restates a rule the write
path enforces rather than adding one somebody must remember.*

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
cannot branch on its own results ([[rules/data]], under *Multi-table writes*). The toolbar control becomes
a menu because a menu has room to name a direction and a format where a bare icon does not.

**History reads from the mutation declaration that already exists.** Every mutation states,
once and on the caller side, what it does and what reverses it ([[rules/data]], under *Mutation declaration*).
A journal is a second consumer of that declaration rather than a new mechanism underneath the
domain — which is what keeps it from becoming the generic layer [[rules/api-layer]]'s
no-repository-layer rule rejects.

**Does a durable history contradict [[rules/data]], under *Undo*? No** *(the grilling #495
declares, run 2026-08-17 because the platform effort's decision 09 — which would have answered
it — is still open, blocked on 11 and 05)*.

Read against the original ADR 0026 rather than against the rule's summary of itself, because the
two differ. The rule as written justifies a session stack on *no second write path*; the ADR's
rejection of the alternative is narrower and more specific:

> **A durable journal of before/after row images** … Rejected for what it does at the remote
> boundary: a workspace is one syncable unit, and a conflict is already resolved by choosing a
> whole side. A history that crosses that boundary has to answer **whose history survives when
> the remote copy wins**, and there is no answer that is not either "discard it" — which is this
> decision, at greater cost — or a merge this application has deliberately never had.

Both grounds are about **replaying**. What was rejected is a journal used to *reverse* work: it
has to answer whose history survives because that answer decides what can still be undone. A
history that is only ever read has the same question put to it and answers it trivially — the
winner's, exactly as with every other row, because it travels as part of the very unit whose
story it tells. Discarding the losing side's account alongside the losing side's data is the
same rule applied to the same unit, not a conflict with it.

So the rule is neither contradicted nor superseded, and this ticket does not touch undo: the
session stack stays exactly as decided. What #495 adds is a second, read-only consumer of the
same declaration. Decision 09 remains free to reach its own conclusion about *Undo*; nothing
built here depends on which way it goes.

*Carried forward from that reading: 09 names [[rules/data]], under *Query cache* — not *Undo* —
as the one rule scoping does not rescue, because a hosted workspace has an unseen writer by
construction.*

**Renewal is a contract-domain action.** It produces a successor rather than moving an
existing contract's end date: a contract's expected amount and its whole derived status
model are computed from its period, so extending a period that already has payments against
it rewrites history rather than continuing it. The successor carries the predecessor's
tenant, units, interval and cost, and starts where the predecessor ended.

## The alternatives that lost

- **Normalizing only the search term, not the stored side.** Half the fix, and the half that
  cannot work: a normalized pattern compared against an unnormalized column matches less than
  the current behaviour does, not more.
- **A collation or an extension function in SQLite.** The engine is compiled into the binary
  and the driver owns that; reaching for a custom collation puts a matching rule in the layer
  the schema module is meant to be the single description of, and it does not travel to a
  test transport that runs under Node.
- **A stored folded twin of each searchable text column** *(measured and rejected
  2026-08-17)*. It is the fastest shape — `tenant.name` falls from 7.0 ms to 0.4 ms — but it
  buys a margin nobody is paying for: the measured worst case across the whole application is
  **19.6 ms**, not the 70–145 ms #488's closing note reported, because that note timed the
  contract directory at the seed's *tenant* count. Declaring which columns fold recovers most
  of the same ground for no column at all. It is also dearer than it looks: SQLite refuses
  `ALTER TABLE ADD COLUMN … STORED`, so each twin arrives by rebuilding its table against live
  data on a workspace that syncs to Drive. **The condition that reopens this is a number** — a
  tenant directory past roughly 30 000 rows, where the column-typed comparison would cross
  50 ms. Reached then as a `STORED` generated column, never a backfilled one.
- **A backfilled folded column kept in step by the write path.** Same speed as the generated
  twin and strictly worse: it needs folding code in every insert and update, leaves every row
  written before it unmatched by the query being fixed, and is exactly the *second list kept
  in step by hand* that the matching module's own header warns against. Named so it is not
  re-proposed.
- **An index on the folded form.** Not an alternative at all, and recorded because it reads
  like one: `explain query plan` answers `SCAN … USING COVERING INDEX`. A leading-wildcard
  `LIKE` cannot seek a B-tree, so every shape considered here is O(rows) and an index changes
  only how wide each row read is.
- **A `VIRTUAL` generated column.** Computed on read, so it measures as the expression it
  replaces — 7.5 ms against 7.0 ms. It is not an optimisation.
- **Client-side filtering for the new filter vocabulary.** Directly against
  the consequence of *List reads* in [[rules/data]] that a loaded set is never re-filtered on the client.
  Rejected without argument; it is named here only so it is not re-proposed.
- **Extending the mutation declaration down into the routers** so a journal writes itself.
  That is the repository layer [[rules/api-layer]] rejects, arriving by another road. The
  journal reads the declaration from where it already sits.
- **Renewal as an edit to the contract's end date.** Rejected above — it rewrites the record
  of the term actually served.

# Components

*Derived 2026-08-17 from the Architecture above; adds nothing to it.*

*Paths rewritten 2026-08-17 for the monorepo layout #499 landed; the application now sits
under `apps/desktop/`.*

| Component | Area | Ticket |
| --- | --- | --- |
| the matching comparison and its two hand-rolled copies, and the stored-side normalizer beside them | `apps/desktop/src/lib/platform/database/search.ts`, `contract/router.ts`, `payment/router.ts`, and the schema module | #488 |
| the shortcut registry, and the sheet generated from it | `apps/desktop/src/lib/design/`, `apps/desktop/src/lib/layout/` | #489 |
| per-record focus inside the list block | `apps/desktop/src/lib/design/block/list.svelte` | #490 |
| verb registration for the palette | `apps/desktop/src/lib/layout/` | #491 |
| the filter declaration a concept makes, against the slot the block already positions | `apps/desktop/src/lib/design/block/list.svelte`, each concept's router | #492 |
| the period member of that vocabulary, spent across two routers that must agree | `apps/desktop/src/lib/dashboard/router.ts`, `apps/desktop/src/lib/payment/router.ts` | #514 |
| selection state and the one-action-many path | `apps/desktop/src/lib/design/block/list.svelte` | #493 |
| the export control as a menu, and the second format's writer | `apps/desktop/src/lib/design/block/list.svelte`, `apps/desktop/src/lib/design/csv.ts`, `apps/desktop/tauri/src/` | #494 |
| the import reader, its validation pass and confirmed preview | `apps/desktop/src/lib/design/`, `apps/desktop/tauri/src/` | #515 |
| the journal, as a second consumer of the mutation declaration | `apps/desktop/src/lib/design/mutation.ts`, the schema module | #495 |
| renewal as a contract-domain action | `apps/desktop/src/lib/contract/` | #496 |

# Data Model

One addition: **the history journal is data at rest**, and it is the only schema change in
this effort. Its shape is its ticket's (#495) and is not fixed here. Everything else — search
normalization aside, which changes how a stored value is written rather than what columns
exist — reads and writes the schema as it stands.

*Held deliberately on 2026-08-17, not by default.* Search normalization was re-examined
against a stored folded column and the sentence above survived it: #488 folds at query time
and adds no column, so it does not touch what columns exist at all. What it adds to the schema
module is a **declaration per searchable column** of whether its stored side can hold a
substitutable character — a statement about existing columns, carrying no data and requiring
no migration. The measurements and the condition that would reopen the question are in
[[efforts/work-the-surfaces-cannot-do/evidence/prototypes/what-the-folded-search-actually-costs]].

# Technical Approach

**The lead is search**, because it is the only item here that is closer to a defect than a
feature, it gates nothing, and it is untouched by the platform effort. It ships first
regardless of how the rest is sequenced.

**The registry is a prefactor and goes before what depends on it** — the cheat-sheet is its
observable outcome, and both the palette's verbs and keyboard reach into a list read the
same registration.

**Two pairs gate inside the effort**, from the 2026-08-17 split: the filter vocabulary (#492)
before the shared period that spends it (#514), and the export menu (#494) before the import
direction that hangs off it (#515). In each pair the first also owns the decision the second
inherits — the vocabulary's shape, and where the spreadsheet format's library lives.

Everything else in the set gates on nothing, except the four items waiting on the platform
effort.

# Migration

**Normalizing the stored side of search rewrites how existing rows are matched.** A column
normalized on write leaves every record written before it unmatched by exactly the query
being fixed. The tenant context already carries this shape for identity numbers — normalized
on save, repaired one record at a time, nothing corrected in bulk — and whether that answer
is acceptable here is #488's to settle, because the point of this fix is that the record is
findable *now*. No other item in this effort touches existing rows.

**Settled 2026-08-17: nothing is migrated, because nothing is stored.** #488 folds both sides
at query time, so every row written before it is matched by the new comparison on the first
search after the update — which is the *findable now* the paragraph above asks for, reached by
having no stored side to leave stale. The precedent the paragraph offered is therefore not
followed, and the alternative that would have needed it is rejected under **The alternatives
that lost**.

# Testing Strategy

*Derived 2026-08-17. How each acceptance criterion is checked, against
[[rules/testing]] and what the harness can actually reach.*

| AC | Checked by |
| --- | --- |
| 1, 2 | Router tests over the memory transport for the matching primitive — **and a Rust test for whatever normalization lands in the Rust half.** [[contexts/desktop/persistence]] is explicit that the TypeScript harness runs under Node, so a router test can pass over a conversion that is broken in the running application. Both sides, or the criterion is not covered. **Plus one test per column declared ASCII-only**, asserting the field validator actually refuses a substitutable character: the declaration is only safe because the write path enforces it, so an unguarded declaration is the one way this design fails silently. |
| 3 | A test that registers a shortcut and asserts it appears on the sheet — the sheet being *generated* is the criterion, so a test that hard-codes the expected list defeats it. |
| 4 | Component-level keyboard interaction over the list block, plus a manual pass in both locales — `dir` reverses what "next" means. |
| 5 | A router test asserting the returned row set narrows. Asserting against the rendered set would pass for a client-side filter, which is the thing being forbidden. |
| 6 | One test asking the landing figure and the ledger about the same period and comparing them. |
| 7 | A round-trip test — export, re-import, compare — plus a collision test asserting **nothing was written**, which is the batch atomicity [[rules/data]], under *Multi-table writes*, already guarantees. |
| 8 | **Manual, and unavoidably so.** Nothing in the suite opens Excel. Both formats, Arabic content, on a real installation. |
| 9 | A test that writes, reopens the database, and reads the history back — the restart is the criterion, so an in-memory assertion does not cover it. |
| 10 | A router test over a multi-record action, asserting one reconcile pass rather than one per record where that is the design. |
| 11 | A test running a registered verb from the palette without a navigation occurring. |
| 12 | Domain tests in the contract module: the successor's term follows the predecessor's, and the predecessor is unaltered — both asserted, since the second is the one that regresses silently. |

**Two criteria cannot be fully automated** — 4 (partly) and 8 (entirely) — and they are named
here so that a green suite is not mistaken for a met spec.

# Operational Considerations

- **A journal is data at rest that grows without bound.** Nothing in the application prunes
  anything today, and a workspace travels to Drive as a whole file. Detection is the workspace
  file size across a seeded run. Retention is explicitly out of scope, which makes the growth
  a thing to watch rather than a thing solved here.

  **Measured 2026-08-17, so retention has a number to argue from: ~57 bytes an entry** — 500
  entries grew a workspace from 73 728 to 102 400 bytes. The figure is reported by
  `history/router.test.mjs` on every run rather than pinned, because the effort does not own
  retention and a threshold here would fail for a change nobody asked about. What it says in
  round terms: a workspace doing a hundred changes a day gains about 2 MB a year, against the
  1.4 MB the seeded workspace weighs today. That is the shape of the problem — slow, and not
  slow enough to leave forever.

# Technical Risks

- **Normalizing the stored side of search touches existing rows.** A column that is
  normalized on write leaves every record written before it unmatched by exactly the query
  that is being fixed. The tenant context already carries this shape for identity numbers —
  normalized on save, repaired one record at a time, nothing corrected in bulk — and the same
  answer may not be acceptable for search, where the point is that the record is findable
  now. Found early by searching for a pre-existing record rather than a freshly written one.
- ~~**Reading xlsx is materially heavier than writing it**, and whether that reader is a
  JavaScript library or a Rust crate is an unmade architecture decision with different
  dependency, binary-size and security consequences. It is declared as a research increment on
  its ticket rather than assumed here.~~ **Answered 2026-08-17 by that increment, in Rust** —
  `rust_xlsxwriter` to write and `calamine` to read, recorded with its sources in
  [[efforts/work-the-surfaces-cannot-do/evidence/research/where-the-spreadsheet-format-belongs]].
  The npm package that would have covered both directions has **no patched release on the
  registry** against two high advisories, which decided it rather than weighing it. #515 reads
  the answer rather than re-deciding it, and inherits one unclosed item: binary size was not
  measured, so the release-profile compile in `integration` is what will show it.
- **The measured baseline is partly stale and its live half still bites.** Contract search has
  since moved into SQL, and the component its dead-code finding named is gone. **Corrected
  2026-08-17 against `contract/reconcile.ts`:** a mutation's reconcile is no longer whole-table
  either — `reconcileTouched` bounds it by the touch-set's closure, and the whole-table
  `reconcile` now runs only at startup, at a UTC-day crossing, and on a remote-sync pull. What
  is still live is the write side: **both paths write one `UPDATE` per changed row,
  sequentially awaited.** In process that is sub-millisecond; over a wire it is a round trip
  each, which is what the bulk-action ticket pays per selected record unless its path is built
  to avoid it.
