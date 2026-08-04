# feat: rebuild the interface — table-first lists, sidebar shell, SQL-backed search

Status: superseded by list-presentation-spec.md
Sources: `src/lib/design/`, `src/lib/layout/`, `src/routes/`, `src/app.css`,
`src/lib/contract/`, `src/lib/payment/`, `src/lib/tenant/`, `src/lib/complex/`,
`src/lib/platform/database/`, `tauri/migrations/`, `tauri/tauri.conf.json`

The reasoning behind the build tickets cut from map [#211](https://github.com/saud-alnasser/rentable/issues/211).
The decisions themselves are ADRs 0006–0012 and the answered sections of
[`ui-overhaul.md`](ui-overhaul.md); this spec links them into one buildable shape and says
why these tickets and not others.

## Problem

A landlord managing hundreds of records sees about six at a time, as decorated cards. The
largest list's search scans whole tables in TypeScript per keystroke — 27.8 ms and 1.5 MB
across the IPC boundary at the baseline's stress scale. Reconcile reads every row on every
save. Every navigation refetches what the cache already held. Arabic renders through a
layout that only half-mirrors. And the window can be dragged below any width the layout can
serve.

## Goal

Every list is a dense, sortable table that fills the window at any supported size; the
shell is a collapsible sidebar with a command palette; create and edit happen in a side
sheet; the surface is black and high-contrast with blue as the single accent; and search,
sort and pagination are answered by SQL rather than by scanning rows anywhere else.

## Constraints

- **The performance criteria are acceptance, not intent** (from #211): one bounded query
  per search; nothing re-filters, re-sorts or re-paginates server-answered data on the
  client; reconcile bounded by the mutation's touch-set; a list's query count independent
  of rows rendered.
- **Arabic is first-class.** Every component a ticket touches ships working in both
  locales; a layout that only works LTR is broken, not partially done.
- **The generated primitives are a permanent fork** (ADR 0007). Rhea's geometry is applied
  by hand by every ticket that touches a primitive, with the transcription's three
  deviations: logical direction utilities, `data-[state=…]` selectors, and the radius-ladder
  remap. `add --overwrite` and `init --reinstall` are never run.
- **The domain model does not move.** Derivation rules stay single-homed in TypeScript
  (ADRs 0006, 0011); statuses, payment rules and identity forms are out of scope.
- **Whole days, UTC** — the domain constraint ADR 0011's trigger model stands on.
- Supported window range: 640×480 upward.

## Architecture

The decisions, each carrying its own reasoning:

- **Data**: `paid_amount` and `expected_amount` become reconcile-maintained columns
  ([ADR 0006](../decisions/0006-payment-aggregates-are-materialized.md)); reconcile splits
  by trigger — touch-set on mutation, whole table at startup, UTC-day crossings and sync
  pulls ([ADR 0011](../decisions/0011-reconcile-is-scoped-by-trigger.md)); the query cache
  is trusted until told otherwise, kept truthful by its three enumerable writers
  ([ADR 0012](../decisions/0012-the-query-cache-is-trusted-until-told-otherwise.md)).
- **Read path**: a list issues one query per (search, sort) state and loads the whole
  sorted result set ([ADR 0010](../decisions/0010-lists-load-whole-result-sets.md)); the
  block rendering it is rewritten under a new name
  ([ADR 0009](../decisions/0009-the-shipping-list-block-is-rewritten-under-a-new-name.md)).
- **Columns**: one vocabulary across the five lists — decision 03 in `ui-overhaul.md` —
  with contracts opening in attention order.
- **Shell**: collapsible sidebar (mirrored in Arabic), global command palette, create/edit
  in a side sheet, drag region and window controls re-sited, a window floor set. Units stay
  reachable only through their complex — the occupancy board makes the complex page the
  answer to "who is in what", so no top-level units list exists.

The seams: routers answer (search, sort) with whole sorted sets; the new list block is the
one consumer of that shape; mutations call one shared invalidation helper; the day-crossing
and sync triggers end in the same root invalidation.

## Approach

Data layer first — it changes what every list reads and is provable by tests alone. Then
the surface tokens (palette), the shell around them, and the block; then each list adopts
the block one at a time, landing green while the card grid coexists; a final contract step
deletes the grid when its last importer moves. The two questions only partial code can
answer are declared increments, attached where they first become answerable.

Rejected shapes, so they are not proposed again:

- **One swap ticket for all five lists** — a five-list diff with search, sort, columns and
  sheets in it is unreviewable, and one rejected list holds back four finished ones.
- **A big-bang geometry-port ticket** — ADR 0007 applies Rhea per touched primitive; a
  separate port ticket would touch every family twice.
- **A top-level units list** — duplicates the occupancy board with one extra column.

### The tickets

Edges are real gates only; build order within the stack follows them.

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| #243 | feat: materialize the payment aggregates | — | ADR 0006 |
| #244 | perf: scope reconcile to the mutation's touch-set | #243 | ADR 0011 |
| #245 | perf: trust the query cache until told otherwise | #244 | ADR 0012 |
| #246 | feat: adopt the black high-contrast palette | — | increment: surface separation without blur (`prototype`) |
| #247 | feat: rebuild the shell around a collapsible sidebar | #246 | window floor; side-sheet container |
| #248 | feat: add the global command palette | #247 | |
| #249 | feat: build the table-first list block | #245, #246 | ADRs 0009/0010; decision 03's treatments; increment: narrow-end overflow (`prototype`) |
| #250 | feat: move contracts to the table-first list | #243, #249 | kills the TypeScript search scan; attention order |
| #251 | feat: move tenants to the table-first list | #249 | active-contract count aggregate |
| #252 | feat: move the property lists to the table-first list | #249 | unit/vacant aggregates (kills the count-per-row N+1); occupancy board |
| #253 | feat: move payments to the table-first list | #249 | |
| #254 | refactor: delete the card grid block | #250, #251, #252, #253 | the contract step |

Each list ticket also moves its create/edit entry into the side sheet mechanically; the
contract form's internal layout is deliberately untouched (see Out of scope).

## Acceptance criteria

- The four structural performance criteria above hold across the diff of the whole set,
  checkable by reading, plus: after-numbers exist against the baseline for search latency,
  reconcile duration, and one list page's query count and payload.
- Every list shows decision 03's columns in its order, sortable as specified; contracts
  open in attention order; dropped fields appear on the detail pages named there.
- Every touched surface renders correctly in English and Arabic, LTR and RTL.
- The layout holds from 640×480 upward, and the window cannot shrink below the floor.
- Navigation between lists renders from cache with no refetch; a mutation updates every
  visible list it affects.

## Risks

- **A prototype increment fails by eye** — surface separation reads flat, or the narrow-end
  behaviour feels wrong. Detected at the declared stop; the ticket holds its claim and the
  session hands back rather than improvising past a HITL gate.
- **Whole-set transport is felt on weak hardware** at implausible scale — bounded to one
  transfer per state change; the baseline comparison is the detector, and ADR 0010 records
  the acceptance.
- **A primitive's Rhea string silently misfires** (physical utility, stale `data-` variant)
  — the transcription's deviations are the checklist, applied per family as it is touched;
  RTL acceptance on every ticket is the detector.
- **A missed invalidation edge behind an infinite staleTime** — structurally prevented by
  the single helper; the review line is "does every data mutation call it".

## Out of scope

- The dashboard's content, and the contract form's internal layout — both remain on the
  map's *Not yet specified*, each a later design session once this set ships.
- The domain model; remote sync beyond the settings page fitting the shell; the custom
  titlebar approach; installing a shadcn-svelte style through the CLI.
