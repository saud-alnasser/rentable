---
use-when: "building a ticket in effort 835, or deciding where the schedule, the receipt, the print sheet, the due-soon rank or the reminder lives"
---

# Architecture

Four pieces, each placed where the repository already keeps its kind of thing. Paths are under
`apps/desktop/src/lib/` unless they say otherwise.

1. **The allocation is one pure function in the contract domain** (`contract/schedule.ts`). It takes
   a contract and its payments and returns the cycles, each with its due date, amount, covered
   amount and state, plus which cycles each payment covers. The schedule, the receipt, the
   due-soon rank and the reminder all read it; none of them allocates for itself. It is computed on
   read and never stored ([[rules/data]], *Derived state*; spec *Constraints*).
2. **The rank gains `due-soon`, decided in `contract/rank.ts` like the other three**, from the
   contract's own fields. It is **not a money rank**: `isMoneyRank` answers "does it owe today",
   and a due-soon contract does not. So the landing screen's outstanding total (which sums money
   ranks, `dashboard/component/landing.svelte:52`) is untouched, and a due-soon row shows the
   amount of the cycle coming due instead of a debt.
3. **Printing is a print sheet in the main window.** A module `print/` owns one sheet mounted in the
   layout frame, hidden on screen, and the only thing visible under `@media print`. Printing
   something means handing the sheet a snippet, waiting for it and its fonts to render, calling
   `window.print()`, and clearing the sheet on `afterprint`. The receipt and the schedule are
   snippets it prints. See the alternatives below.
4. **The reminder is a contract act** (`contract.remind`), declared once in `contract/acts.ts` like
   every other act ([[rules/interface]], *Record card actions*), run by the contract host, which
   reads one procedure for the message's facts and opens `wa.me` through the opener.

## Printing: the approaches weighed

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A. Print sheet in the main window** (chosen) | One window, one capability line (`core:webview:allow-print`); no second startup; the sheet reuses the query cache, the loaded locales and the font already in the page | Every print goes through `@media print` rules that must hide the whole shell; the page is what the dialog previews, so there is no on-screen preview of our own | A shell element that escapes the hide rule prints; caught by a component test that renders the frame with a sheet and asserts every other region carries the hidden rule | One module; anything printed later is a new snippet |
| B. A second window on a print route | The printed document is only the receipt, no hide rules | The root layout runs startup, the sync manager, the close handler and deep links for every window (`routes/+layout.svelte`), so a second window is a second app instance against the same replica unless a new `shell` mode strips all of that; needs window-creation permissions and a second capability label | A second sync manager on one replica; startup gates re-run | Two window lifecycles to keep in step |
| C. A print route inside the shell, with a preview and a print button | An on-screen preview before the dialog | Still needs A's hide rules to keep the shell off paper, plus a route per printable; one more page in the trail | Same as A | A plus routes |

**A is chosen, by the human on 2026-09-25,** because B's cost is a second application instance and C is A with an extra page.
The system dialog already previews on all three platforms (the research's F1.1, F1.4, F3.1).
Iframe printing is out: it does nothing on macOS (F1.6).

## Where the receipt is offered after recording

The draft spec offered it in the success toast beside undo. The toast carries one offer
(`design/mutation.ts:239-276`; [[rules/interface]], *Undo*), so this was put to the human as two
approaches: a second toast action, amending the rule, or no offer, the new ledger card's receipt act
being one click away. **The human chose no offer** (2026-09-25); the spec's requirement 8 is
corrected, and `design/mutation.ts` does not change.

# Components

**`platform/database/schema.ts`**: `payment` gains `method` (`text` enum `cash | bank-transfer |
cheque | ejar`, nullable), `reference` (`text`, nullable), `note` (`text`, nullable), and
`PaymentSchema` gains the three as `.nullish()`. Not added to `ASCII_ONLY_COLUMNS`.

**`payment/router.ts`**: `serializePayment` returns the three; `update`'s input pick and its `.set`
list them (today they list only `date` and `amount`, `router.ts:314-357`, so without this undo would
drop them); `PAYMENT_SEARCH_COLUMNS` gains `payment.reference`. New read `receipt({ id })`: the
payment, its tenant (name, national identity), its contract (govId, cost, interval, period), its
units with their complex names, and from `schedule.ts` the cycles this payment covers and what
remains of the contract's total cost after it.

**`payment/component/form.svelte`**: the method as a toggle group of four ([[rules/interface]],
toggle group for two to four options; `design/tests/few-options.test.ts` refuses a select), with
none chosen and a chosen one clearable; the reference as an input; the note as the `textarea`
primitive, the first in an application form. **`details.svelte`** shows the three in its
specification, omitting what is not recorded except the method, which says *not recorded*.

**Payment history**: `useCreatePayment`, `useUpdatePayment` and `useDeletePayment`
(`payment/query.ts:190-295`) declare `records`, and their inverses `records(direction)`, as
`useUpdateContract` does (`contract/query.ts:287-309`), each through `toPaymentHistoryEntry`
(`payment/query.ts:57-65`) with `created`, `edited` and `deleted`. `payment/component/details.svelte`
renders `RecordHistory concept="payment"` as `contract/component/details.svelte:125` does. The
history table and its reads do not change.

**`payment/acts.ts`**: a `receipt` act, primary group, applying to every payment, run through the
payment host, which reads `receipt` and prints the receipt snippet. It projects onto the ledger card,
the record page and the palette, as every act does.

**`payment/component/receipt.svelte`**: the receipt, two blocks on one page, each with its own
`lang` and `dir`, strings from `i18nObject('ar')` and `i18nObject('en')` side by side (both locales
are loaded at startup, `layout/startup.ts:493-497`), money and dates through `platform/locale.ts`
with the locale passed in. The Arabic block sets `lang="ar"` on itself so the Arabic line height in
`tokens.css` applies there. **`payment/receipt.ts`**: the receipt reference (below) and the shape
the component renders, pure and tested.

**`contract/schedule.ts`**: `scheduleContract(contract, payments, now)` →
`{ cycles: ScheduleCycle[], coverage: Map<paymentId, cycleIndex[]> }`. Cycle count from
`getContractCycleCountForPeriod`, falling back to `countExpectedPayments(contract, end)` as
`getContractTotalCost` does; due dates from `getContractCycleStartDate`; payments sorted by date
then id (UUIDv7, so id order is recording order: `platform/database/identity.ts:47`); covered
compared with the domain's `EPSILON`, which this exports. A cycle is due today exactly when
`countExpectedPayments` first counts it, so the schedule and the outstanding figure agree by
construction.

**`contract/router.ts`**: new read `schedule({ id })` loading the contract and all its payments.
New read `reminder({ id })` returning the tenant's name and phone, the unit names, and the amount
and date the message states: for `overdue` and `owing`, the uncovered total of late and due cycles
and the earliest of their due dates; for `due-soon`, the next cycle's uncovered amount and due date.
`contract.get` gains `rank`, so the record page's acts can gate on it as directory rows already do.

**`contract/rank.ts`**: `CONTRACT_RANKS = ['overdue', 'owing', 'due-soon', 'ending-soon']`.
`getContractRank` takes the contract object rather than four positional fields (it needs start,
interval, cost and paid amount now), and files a contract under `due-soon` when it has no rank from
money and `scheduleContract` finds its next cycle due within seven days and not covered.
`isMoneyRank` becomes an explicit set (`overdue`, `owing`) instead of "not ending soon", which would
make `due-soon` a money rank silently. `getContractRankBounds` gains a `due-soon` branch: excludes
terminated, requires an unpaid balance, `endFrom: today` (a superset; the TS pass decides).
`compareContractsByRank` orders due-soon by due date, then name.

**Every place that enumerates ranks** (found exhaustive by the type checker where it is a `Record`):
`rank-filter.ts` (`toRankKey` gains `dueSoon`), `dashboard/component/section.svelte` (glyph, label,
the row's amount), `contract/router.ts` bounds and filter, i18n `contracts.ranks.dueSoon` in both
locales (the Arabic must not be مستحق, which `owing` already is), and the rank tests.

**`contract/acts.ts`**: `contract.remind`, primary group, `appliesTo` a contract whose `rank` is
`overdue`, `owing` or `due-soon`; shown `unavailable` with the reason where the tenant has no phone
(it always has one today; the gate costs a line and survives a schema change). A new host request
`remind`. Because acts project everywhere, the act appears on the landing row, the record page, the
contract directory's cards and the palette, not only the two the spec names; the spec is corrected
to say so. The landing row renders it as the renew act is rendered (`section.svelte:135-147`).

**`contract/reminder.ts`**: `toWhatsAppUrl(phone, message)`, stripping the `+` and URL-encoding,
and the message composed from the reminder read in the showing locale. Pure and tested.

**`contract/component/schedule.svelte`**: the schedule pane, a new record section `schedule` after
`payments` (`contract/section.ts`, `details.svelte` collections), its rows through the cells the
ledger uses, the state through the status presentation (an icon and a label for screen readers,
[[rules/interface]], *Status presentation*). A *print* act on the contract prints the same rows as
a snippet with Arabic and English headings.

**`print/`**: `sheet.svelte.ts` (the state: the snippet being printed, `print(snippet)` returning
when `afterprint` fires), `component/sheet.svelte` (mounted in `layout/component/frame.svelte`
outside the scrolling main), and the `@media print` rules in `app.css`: everything but the sheet
`display: none`, the sheet static, full width, no overflow, light tokens forced, `@page` margins set.

**`apps/desktop/tauri/capabilities/default.json`**: `core:webview:allow-print`, without which
`window.print()` does nothing on macOS (research F1.5).

## The receipt reference

Taken from the payment's UUIDv7: its 48-bit timestamp, 12-bit counter and the last 20 bits of the
id, 80 bits in Crockford base32, printed `XXXX-XXXX-XXXX-XXXX`. Two payments share one only by
being made in the same millisecond with the same counter on two machines and drawing the same last
20 bits.

*Corrected 2026-09-25 at the effort's review.* This said the first 20 random bits, after the
variant. Migration 0003 rewrote every payment recorded before ids were UUIDs as one timestamp,
counter 5, a zeroed tail and the old row number in the last 48 bits
(`packages/workspace-migrations/migrations/0003_serious_synch.sql`), so every such payment gave the
same reference and criterion 9(b) failed. The last 20 bits hold the row number there and random
bits on an id minted since; nothing else about the reference changes.
The reference is not a sequence and says nothing about order (spec *Out of Scope*).

# Data Model

Migration `0005`, generated by `pnpm db:generate:desktop` from the schema change above and
hand-finished as [[contexts/desktop/persistence]] requires: three `ALTER TABLE payment ADD COLUMN`,
all nullable, no default, no backfill. Nothing else in the schema changes. The allocation, the
schedule, the rank and the reminder are all derived.

# Technical Approach

The order, and why:

1. **Allocation** (`contract/schedule.ts` and its tests). Everything else reads it; it has no
   dependencies and its criterion 6 cases pin the rule before anything renders it.
2. **Payment history** (the three declarations and the record's history section). Its own
   commit, before the new fields, so the fields' commit shows its edits entering history rather
   than building history at the same time.
3. **Payment details** (schema, migration, router, form, details). Independent of 1; ordered here
   because the receipt shows the details.
4. **Schedule pane** on the contract record (reads 1).
5. **Print sheet** and the capability, printing the schedule as its first snippet: the schedule
   has no new read beyond 3, so the print path is proven on the smaller page first.
6. **Receipt** (reads 1, 3, 5).
7. **Due-soon rank** (reads 1), then **the reminder** (reads 1 and the rank).

Each is one ticket, one commit, on the effort branch ([[rules/version-control]]).

# Integration

- **[[rules/interface]] *Attention rank*** names the ranks; it gains *due soon* in the rank commit.
- **`layout/component/frame.svelte`** mounts the sheet; nothing else in the frame changes.
- **`workspace/router.ts:71`** (the transfer) picks `{ date, amount }` from `PaymentSchema`. It keeps
  doing so: a transferred payment arrives without method, reference or note. Noted, not changed.
- **[[contexts/desktop/contract]]** gains *Schedule*, *Allocation* and *Due soon* in its language.

# Migration

Schema version 5. `migration::refuse_newer` means a machine on a build before this one refuses a
workspace once any member opens it on this build, with its message asking to update. That is how
every schema change here has shipped; the changeset says so. Existing payments read method, reference
and note as null, which the form and the record show as not recorded (criterion 1(c)).

# Testing Strategy

| Criterion | Check |
| --- | --- |
| 1, 2 | router tests through the real caller on `memory.ts` (create and update round-trip the fields, a pre-existing payment reads null); component tests on `payment/tests/form.svelte.test.ts` and `record.svelte.test.ts` |
| 3 | router test: `getMany` and `search` find by a reference fragment, in both foldings |
| 4 | router test: update then the captured inverse restores all three fields; mutation tests that create, update, its undo, and a single delete each append an entry through `api.history.append`; component test that the payment record lists them |
| 5, 6 | `contract/tests/schedule.test.ts`, pure: the four-quarter cases of 6(b), terminated 6(c), and a property sweep that the uncovered sum of late and due cycles equals `getOutstandingExpectedAmount` for generated contracts and payments (6(a)); 6(d) holds by there being no column |
| 7 | component test that the schedule snippet renders every row with both headings; the printed page by hand |
| 8 | acts test (the receipt act on every payment, a terminated contract's included, in `design/tests/acts.test.ts`) |
| 9 | `payment/tests/receipt.test.ts` (the reference: distinct for two ids a millisecond and a counter apart; coverage names two cycles); component test for both blocks' `lang` and `dir` and the omitted fields |
| 10 | **by hand on each platform**: print, save as PDF, open the PDF, select Arabic text. Nothing automated can drive a system print dialog |
| 11 | `contract/tests/rank.test.ts` cases (a) to (d), the bounds soundness sweep extended to four ranks, dashboard router test |
| 12 | `contract/tests/reminder.test.ts` for the URL and message in both locales; acts test for the gate |

Frame test: rendering the frame with a sheet, every region but the sheet carries the print-hidden
rule, so a region added later that escapes it fails.

# Operational Considerations

- **The print path is checked by a person on Windows, macOS and Linux** before the effort closes
  (criterion 10). This is one of the checks held for the end of the run.
- WebView2 may print its own header and footer with the page address. `@page` margins can't
  switch them off from the page; the dialog's *Headers and footers* option can, and it is remembered
  per machine. If it shows, the fix is native (`PrintToPdf` settings) and is out of scope; the
  close says so.

# Technical Risks

- **`@media print` under WebView2 is not traced in source** (research F5.2). If it does not apply,
  the whole shell prints; the Windows check in criterion 10 finds it first.
- **`window.print()` returning before the dialog closes** on some platform would clear the sheet
  early; clearing on `afterprint` rather than on return is the guard, and the hand check shows it.
- **macOS 26 print bugs** (research F1.7) could truncate or crash; the macOS hand check finds them.
- **A rank's signature change reaches three callers and their tests** (`dashboard/router.ts:110`,
  `contract/router.ts:1277`); the type checker finds each.
