---
use-when: "building a ticket in effort 861 and the approach is not obvious from the spec"
---

# Architecture

Six independent fixes and one data change. Paths are relative to `apps/desktop/src/lib/`
unless written out; `pkg/` is `packages/design/src/lib/`. The seam maps behind this plan were
read against the tree at `86dd51f5`.

## The renewal link (requirements 5 to 8)

**A nullable column on `contract`, `renews_contract_id`, naming the contract a renewal
continues, written by `contract.renew` and by a recognition pass that runs inside the existing
whole-table reconcile.** Whether a contract *is renewed* is never stored: it is read as "a
contract that is not terminated names it", so deleting or terminating the successor puts the
predecessor back with no reconcile change ([[contexts/repository]], *Reconciliation owns the
derived columns*; spec *Constraints*).

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. Column, recognised at every reconcile** (chosen) | an addition that moves no floor; heals renewals made by older builds, older undo and imports without the column; no run-once state | links a hand-made next contract that matches the rule | a match that was not meant as a renewal is written into data (spec *Risks*) | one pure function, tested in memory |
| B. Column, recognised once per workspace | matches the spec as first written | needs a marker table; renewals by older builds or imports stay unlinked | the marker itself replicates and can race | a second piece of state to migrate later |
| C. No column, inferred at read time | no migration | contradicts requirement 5; a renewal moved off the next day is never seen; a unit-set comparison in SQL in two reads | slow reads; differs from what an export says | the rule lives in SQL twice |
| D. A separate link table | keeps `contract` narrow | delete and restore must carry its rows as `contract_unit` does; one more table in heal and transfer | a link row orphaned by an older build's delete | more surface for the same fact |

The human chose A at /plan (spec, requirement 6). A backfill inside the migration was not an
option: `addition_sql_is_additive` (`tauri/src/database/step.rs`) rejects `UPDATE`, and as an
upgrade it would not run on open.

## A failed read (requirements 1 and 2)

**A fourth kind on the existing empty block, `failed`, with *try again* as its act**, drawn by the
list shell, the record surface and the landing screen from one helper deciding what counts as a
failed read: `query.isError && query.data === undefined`, the settings page's own test
(`settings/component/page.svelte`). A refetch that fails while data is held keeps the data.

Rejected: a new `read-failed.svelte` block (a second block for what the empty block already is, a
region with nothing to show and one act; it would also have to be named in
[[contexts/desktop/components]]); the standalone surface the settings page uses (it does not fit
inside a list frame, a record body or the landing band).

## Error toasts (requirements 3 and 4)

**Per-toast options on the two error functions, and the toaster reading the design contract for
its side.** `notify.error` and `showErrorSentence` (`notification/notification.ts`) pass
`{ duration: Number.POSITIVE_INFINITY, closeButton: true }`; every error path goes through one of
the two. The sonner primitive (`pkg/primitive/sonner/sonner.svelte`) reads `useDesignContract()`
and sets `position` (`bottom-right` in LTR, `bottom-left` in RTL), `dir`, and
`closeButtonAriaLabel` from the contract's `close`. svelte-sonner 1.2.1 positions physically and
caches `dir="auto"` once, so both are passed explicitly. Rejected: a toaster-wide `closeButton`
(it puts a close control on success toasts, which leave on their own).

## Labels on fills (requirement 9)

**Fill tokens beside the text tokens, with white labels kept.** In dark, no single destructive
value passes both as text on the dark surfaces (needs L at least about 0.61) and under a white
label (needs L at most about 0.59), so the fill and the text must be two tokens. The seam map also
measured primary failing in light (4.25) and dark (3.24) and permitted in dark (2.36); requirement
9 already names them.

- New tokens in both appearances: `--primary-fill`, `--destructive-fill`, `--permitted-fill`, and
  `--destructive-foreground` (replacing every `text-white` on a destructive fill), mapped under
  `@theme inline`. In light a fill may alias its text token where that already passes.
- Every site drawing a label on one of those fills moves to the fill token.

Rejected: dark labels on the light fills in dark mode (a pastel red button with black text reads
as a warning chip rather than a destructive act, and moves every primary button's look); darkening
the text tokens (fails text on the dark surfaces).

## Closing a form with changes (requirement 10)

**The form surface owns the question; each form says whether it is dirty.** `form-surface.svelte`
takes `dirty` and catches every close it can see (Escape and an outside click through bits-ui's
`onEscapeKeydown` and `onInteractOutside`, the corner close through the open setter) and hands its
actions snippet a `requestClose` for the cancel button, which today bypasses it. A submit still
closes through the form's own path and never asks. Rejected: the surface snapshotting the form's
values itself (it cannot see state outside a superform, such as the payment's direction or the
complex's unit entry, and 13 of the 22 forms are not superforms).

# Components

- **`pkg/block/empty.svelte`**: `EmptyKind` gains `failed`; its act is the caller's `onRetry`
  labelled by the contract's `tryAgain`. `data-empty="failed"`.
- **`pkg/strings.ts`** (the design contract): `readFailed`, `readFailedDescription`, `tryAgain`,
  `discardChangesTitle`, `discardChangesDescription`, `discard`, `keepEditing`. Mapped in
  `shell/component/window.svelte` from `$LL`; added to `packages/design/src/tests/contract-strings.ts`
  and the hand-built harnesses. `tryAgain` maps the shell's existing `layout.error.retry` ("try
  again"), so the caught-error screen and the failed region say the same words.
- **`error/read.ts`** (new): `toReadFailure(query)` returns `{ failed, retry }` for any query
  result. The list callers, the record callers, the workspace page and the landing screen use it.
- **`list/component/list.svelte`** and `list/list.ts`: `failed` and `onRetry` props; a failed read
  draws `Empty kind="failed"` before the `hasResults` branch, with no create and no toolbar count.
  Its eight callers pass them.
- **`pkg/block/record-surface.svelte`**: `failed` and `onRetry`, drawn before `!found`; the
  `shownRecord` effect leaves the name `undefined`, not `null`, on a failed read. Its five record
  callers and `organization/workspace/component/page.svelte` pass them (the page's `isLoading`
  expression stops special-casing `isError`).
- **`dashboard/component/landing.svelte`**: one `<Loading>` wraps the figure band and the sections,
  with a band-shaped skeleton; a failed read draws the failed block in place of both; *nothing to
  chase* requires `isSuccess`. No `?? 0` remains on a figure.
- **`notification/notification.ts`**, **`pkg/primitive/sonner/sonner.svelte`**: as above.
- **`pkg/tokens.css`**, **`pkg/tests/tokens.test.ts`**, and the label sites: `primitive/button`
  (default and destructive, including their `/90` hovers), `primitive/badge` (default; the error
  badge's `/70` becomes solid), `block/field-error.svelte`, `dashboard/component/ending-soon.svelte`,
  `contract/component/end-date-field.svelte`, `calendar-day.svelte`, `checkbox.svelte`,
  `input.svelte`, `organization/workspace/component/add-sheet.svelte`, `way-in-surface.svelte`.
- **`pkg/block/form-surface.svelte`**, **`pkg/block/confirm-dialog.svelte`** (gains an optional
  `cancelLabel`), and the 22 forms on the surface.
- **`platform/database/schema.ts`**: `renewsContractId` on `contract` and `ContractSchema`.
- **`contract/serialize.ts`**: carries `renewsContractId`, and a read-only `renewed: boolean` that
  `ContractSchema` does not hold (so a restore cannot write it).
- **`contract/row.ts`**: `renewedColumn`, the one SQL expression for *renewed*:
  `exists (select 1 from contract successor where successor.renews_contract_id = contract.id and
  successor.status <> 'terminated')`. `retired.ts` adds `merged_into is null` to the subquery by
  itself.
- **`contract/renewal/recognize.ts`** (new, pure): `recognizeRenewals(contracts, unitsByContract)`
  returns `{ successorId, predecessorId }[]` by spec requirement 6.
- **`contract/reconcile.ts`** / `contract/router.ts` `reconcile`: runs recognition and writes its
  links in one batch, before deriving anything.
- **`contract/rank/rank.ts`**: `ContractLike` gains `renewed?: boolean`; `isContractEndingSoon` and
  `getContractRank` return no ending-soon for a renewed contract; `getContractRankBounds` gains
  `renewed: false` for ending-soon.
- **`contract/directory/router.ts`**, **`contract/router.ts`** (`get`), **`dashboard/router.ts`**:
  select `renewed` (the directory and `get` through `renewedColumn`; the dashboard, which reads every
  contract, from a set built over the same rows); `matchesRankBounds` honours the new bound.
- **`contract/acts.ts`**: `contract.renew` gains `appliesTo: (contract) => !contract.renewed`.
- **`contract/renewal/router.ts`**: takes `cost`; writes `renewsContractId`; refuses a contract
  already renewed (`contract.alreadyRenewed`, both locales). The comments ruling cost out are
  rewritten. **`renewal/renewal.ts`**: its "Nothing here records lineage" paragraph is rewritten.
- **`contract/component/form.svelte`**: the cost field is enabled in renew mode and sent;
  `renewDescription` in both locales says the rent may change.
- **`contract/transfer.ts`**: a `Renews` column carrying the predecessor's reference.
- **`tauri/src/database/heal.rs`**: moves `renews_contract_id` off a retired contract to its
  survivor, and normalises it to the final target when comparing copies.

# Interfaces

- `contract.renew` input: `{ contractId, govId, start, end, cost, id? }`. `cost` is required; the
  form always sends it.
- `ContractCreateSchema`, `ContractUpdateSchema` and `ContractFieldsSchema` omit
  `renewsContractId`, so create, duplicate and edit can never write it.
- `SerializedContract` gains `renewsContractId: string | null` and `renewed: boolean`. Every read
  that returns a serialized contract to an act sets `renewed`: `contract.get`, `directory.list`;
  reads that only list for a tenant or unit set it through the same column.
- `list.svelte` props: `failed?: boolean`, `onRetry?: () => void`. `RecordSurface`: `failed?:
  boolean`, `onRetry?: () => void`. `Empty`: `kind: 'failed'` requires `onRetry`.
- `FormSurface`: `dirty?: boolean` (default false); `actions: Snippet<[{ requestClose: () => void }]>`.
  A form ignoring the argument still compiles; every cancel button moves to `requestClose`.
- `ConfirmDialog`: `cancelLabel?: string`.
- Transfer file: the contracts sheet gains an optional `Renews` column. A file without it reads as
  before.

# Data Model

- Migration `0009` (step 10), generated with `pnpm db:generate:desktop`:
  `ALTER TABLE contract ADD renews_contract_id text`. Nullable, no default, no index (the
  repository leaves reference columns unindexed by measurement, [[contexts/desktop/persistence]]).
- Declared in `tauri/src/database/step.rs` as **an addition, `readers_need: true`**, as `0008` is,
  with a `describes` sentence in `organization/i18n/{en,ar}.ts`. Why an addition: an older build
  ignores the column. What it gets wrong is only omitting the link (its renew, its undo restore,
  its export), and requirement 6 heals that where the rule matches. Nothing an older build reads
  changes meaning. The ticket names the kind in its criteria ([[rules/migrations]]).

# Technical Approach

The order tickets land in, and why:

1. **Labels on fills.** Design tokens only; nothing depends on it.
2. **Error toasts.** Two functions and the primitive; independent.
3. **The failed state**: empty kind, contract strings, `error/read.ts`, the list shell and its
   callers, the record surface and its callers, the workspace page.
4. **The landing screen**: after 3, which it draws from.
5. **The form surface's question and `requestClose`**, with the confirm dialog's `cancelLabel`.
6. **Every form reports `dirty`**: after 5. The nine superforms seed through
   `reset({ data: seed, newState: seed })` instead of `form.set`, async fills (the contract's
   renewal predecessor, the payment's amount and date) pass `{ taint: false }`, and `dirty` is
   `isTainted($tainted)`. The thirteen others compare their editable state with a
   `$state.snapshot` taken at open, through one `form/dirty.ts` helper; the preview surfaces
   (made link, reminder preview, print preview) and the upgrade sheet pass nothing.
7. **The link column**: migration, step declaration, seeds, schema, serialize, the create and
   update schemas' omission, and heal. Before any writer, so nothing writes a column that is not
   there.
8. **Renew writes the link and may change the rent**, with the refusal and the form: after 7.
9. **Recognition** in reconcile: after 7.
10. **Reading *renewed***: the rank functions, the three reads and the act: after 7; its tests
    need 8 or 9 to make a link.
11. **Transfer**: after 7. The `Renews` reference is soft: it is not in the sheet's `references`
    (which would drop a row, and which the planning pass caches per sheet before rows of the same
    sheet are named), and is resolved at write against the contracts the import wrote or the
    workspace holds; an unresolved one writes no link and refuses nothing. The import's write runs
    recognition once at its end.

Each ticket amends the rule or context text its change contradicts, in its own commit:
[[rules/interface]] *Empty* and *Error* (3), *Feedback* (2), *Form surface* (5);
[[contexts/desktop/contract]] gains the renewal link and *renewed* in its vocabulary, and *Ending
soon* excludes a renewed contract (7, 10). A changeset rides with each user-visible ticket.

# Integration

- `retired.ts` rewrites the `renewedColumn` subquery; a test checks a retired successor does not
  count.
- `heal.rs` (Rust) and the seeds in `tauri/src/organization/lease/test/seed.rs`: move the version-9
  seed into `SEEDS`, add `SEEDED_AT_TEN`, widen the contract row from 12 to 13 columns in
  `with_nothing_merged` and every `carried_*`.
- `undo/move.ts` and the renewal's undo declaration (`renewal/query.ts`): redo re-sends the
  variables, now carrying `cost`, so the link and the rent come back with the same id.
  `contract.restoreMany` carries `renewsContractId` through `ContractSchema`.

# Migration

What exists keeps working with no step by a person:

- The column arrives empty on first open by any build that ships it; no floor moves, so no build
  is stopped and nobody is asked to upgrade.
- The first reconcile on a machine that may write links the renewals already in the data.
- Older builds on the same workspace go on as before. A link they drop is healed at the next
  reconcile where it matches; one they cannot heal leaves a predecessor in ending soon, as today.
- No organization is reset and no replica is dropped ([[contexts/repository]], *Constraints*).

# Testing Strategy

By acceptance criterion in `spec.md`:

1. `list/tests/list-empty.svelte.test.ts` adds the failed case (no create, no *nothing yet*,
   *try again* calls `onRetry`); `pkg/block/tests/record-surface.svelte.test.ts` adds failed versus
   not found versus found; `pkg/block/tests/empty.svelte.test.ts` adds `data-empty="failed"`; one
   directory and the workspace page each get a test with a rejecting host.
2. `dashboard/tests/landing.svelte.test.ts`: `host.dashboardGet` held pending (no `0` in the band)
   and rejected (failed block, no empty state, retry re-runs).
3. `notification/tests/notification.test.ts` asserts the error options on both functions and none
   on success; the running application shows an error toast standing after ten seconds.
4. A component test renders the toaster under each direction and reads `data-x-position`; the
   running application in Arabic and English (human check).
5. Router tests: renew writes the link; undo then redo restores it with the same id; delete then
   `restoreMany` keeps it; a duplicate and a create cannot write it; export then import keeps it;
   heal moves it to a survivor (Rust test beside `links_moved`).
6. `contract/renewal/tests/recognize.test.ts` for the pure function (match, tenant, units, start,
   terminated, ambiguity on either side, existing link untouched, contracts with no units); a
   router test seeds an unlinked pair and runs `contract.reconcile`; the Rust seed walk opens the
   version-9 seed at version 10 with its rows.
7. `rank/tests` for the functions and bounds; directory, `get` and dashboard router tests for a
   renewed contract, then with its successor deleted and terminated; `acts` test for `appliesTo`.
8. Renewal router tests replace the copied-cost pin (`renewal/tests/router.test.ts`) with a changed
   and an unchanged rent, and assert the predecessor's row is byte-identical after.
9. `pkg/tests/tokens.test.ts` gains `{ fill, label }` pairs for primary, destructive and permitted in
   both appearances at 4.5:1, including each fill composited at the alpha its hover uses over the
   background, card and popover.
10. `pkg/block/tests/form-surface.svelte.test.ts` via `src/tests/form-surface-harness.svelte`:
    Escape, outside click, corner close and `requestClose` with `dirty` true ask, and with false
    close; keep editing keeps focus in the form; discard closes. A tenant form test proves a seeded
    edit is not dirty until a field changes; contract, payment and one organization form are checked
    in the running application.

`pnpm test`, `pnpm check`, `pnpm lint` and `pnpm test:rust` pass at every ticket.

# Operational Considerations

Held for the human at the close, in the run log's `## Needs you`: the colours
of every primary, destructive and permitted fill in both appearances on the running application;
the toaster's side in Arabic; the discard question on a real form.

# Technical Risks

- **Superforms seeding.** If `reset({ newState })` misbehaves with the contract form's async
  predecessor load, an edit opens dirty and every close asks. It first shows as the tenant or
  contract form test asking on an untouched close.
- **Nested dialogs.** Escape inside the discard question must close the question, not reach the
  form surface beneath. bits-ui stacks layers, but a test pins it.
- **The `renewed` subquery** runs once per listed row. Workspaces hold hundreds of contracts; if a
  directory read slows measurably, an index on `renews_contract_id` is a later addition.
- **Token values move how every primary button looks.** The fills change in dark mode by design;
  the human check above is where a wrong value is caught.
