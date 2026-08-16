---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: research
---

# What does the interface cost today — search, scrolling, reconcile, and the query traffic behind one list page?

Verified against: this repository at `5a8cee5`, 2026-08-03
Status: answered, with two findings that contradict premises the overhaul is currently planned on — see **What this contradicts**. Frame cost is measured on GPU-composited Chromium and bounds the blur's cost from the main thread only (see Limitations).

Taken for [#219](https://github.com/saud-alnasser/rentable/issues/219), so the after-numbers of the interface overhaul mean something. ADR 0008 replaces both list blocks in one change, so these are unrecoverable once it lands.

## Answer

**The contract list is already linear in table size, and does the scan in TypeScript rather than in SQL.** Searching it loads *every* contract joined to its tenant plus *every* payment, serializes all of them, and then filters the array — 27.8 ms and **1.52 MB across the IPC boundary per keystroke** at the large scale, against 0.56 ms and 2.7 kB for a list that filters in SQL. Separately, `tenant.getMany` returns the whole table unbounded — 5,000 rows and 543 kB in one call — and **that read is live today**, on every contract-form open, not only on the unreachable table path.

**Reconcile is the other linear cost, and it runs on every mutation and at every app start.** It reads every contract, every payment, every unit and every assignment regardless of what the mutation touched: 2.6 ms / 184 kB at the realistic scale, 40.7 ms / 2.63 MB at the large one — a 15.6× rise for a 14× rise in contracts.

**Scrolling is not a problem on this hardware, and the blur is not what costs when it is.** Every list holds vsync at 5.9 ms/frame with zero dropped frames, with 26–90 live `backdrop-filter` surfaces in the viewport. Under 6× CPU throttling frames do blow the budget — p95 23–53 ms — but **removing every `backdrop-filter` did not improve them** in any condition measured, and several blur-free passes came out marginally worse, which is what a difference below the noise floor looks like. Each condition is one pass, so this bounds the blur's cost rather than pricing it. The jank that exists under constraint is main-thread work, not compositing.

## The machine

| | |
| --- | --- |
| CPU | AMD Ryzen 9 9950X, 16 cores / 32 threads |
| Memory | 61.7 GB |
| OS | Windows 11 Pro, 10.0.26200 |
| Node | v24.18.0 |
| better-sqlite3 | 13.0.2 |
| Chrome | 150.0.7871.187, GPU rasterization on, ~170 Hz display |

Everything below is single-run on an otherwise idle machine. A desktop tracker's user is not on a 9950X, so treat every absolute millisecond here as a **floor** and the query counts and payload sizes — which are hardware-independent — as the durable figures.

## The two row counts

Seeded by `scripts/seed.ts`'s own logic and distribution, with the counts parameterised. Absolute rows, as stored:

| Table | realistic | large |
| --- | --- | --- |
| `tenant` | 400 | 5,000 |
| `complex` | 12 | 200 |
| `unit` | 152 | 2,522 |
| `contract` | 317 | 4,423 |
| `payment` | 287 | 3,739 |
| `contract_unit` | 460 | 6,511 |
| database file | 163,840 B | 1,503,232 B |

"Realistic" is a single operator running about a dozen complexes; "large" is roughly 14× that in contracts, chosen to make growth terms visible rather than to model anyone's portfolio.

## Findings

### Search latency per keystroke

One call per growing prefix of an 8-character term, 7 repeats after a discarded warm-up, median of the per-prefix medians and the worst prefix. `q` is queries issued per keystroke; bytes are the JSON the transport hands back on the worst prefix.

| List | realistic median | realistic worst | large median | large worst | q | large worst bytes |
| --- | --- | --- | --- | --- | --- | --- |
| **tenants** — shipped, `tenant.getPaginated` | 0.16 ms | 0.37 ms | **0.56 ms** | 0.74 ms | 1 | 2,740 |
| **tenants** — `data-table` path, `tenant.getMany` unbounded | 0.15 ms | 0.29 ms | **0.55 ms** | 2.22 ms | 1 | 235,126 |
| contracts — `contract.getPaginated` | 2.21 ms | 2.47 ms | **27.77 ms** | 31.10 ms | 2 | 1,517,462 |
| complexes — `complex.getPaginated` | 0.11 ms | 0.16 ms | 0.17 ms | 0.28 ms | 1 | 2,253 |
| units — `complex.units.getPaginated` | 0.45 ms | 0.47 ms | 0.99 ms | 1.34 ms | 3 | 6,059 |
| payments — `contract.payments.getPaginated` | 0.10 ms | 0.15 ms | 0.20 ms | 0.30 ms | 1 | 349 |

- **The contract list's search cost does not depend on the term.** `src/lib/contract/router.ts:449-473` takes the search branch by loading every contract and every payment first, then filtering the serialized array with `matchesContractSearch`. Pagination is applied to the filtered array, so the cost is the whole table on every keystroke whatever matches.
- **The tenant, complex and payment lists filter in SQL** (`like` in the `where`), which is why their bytes stay flat as the table grows.
- **The unit list issues three queries per keystroke** — `getUnitsWithDerivedStatus` adds two beyond the page read (`src/lib/complex/router.ts:198-216`) — and filters `name`/`status` in TypeScript after loading every unit of the complex.

### Query count and payload size for one list page

First page, no search, `limit: 24`. `transport` is what crosses the boundary as JSON; `result` is what the procedure returns to the component.

| List | rows | q | realistic transport | large transport | large result |
| --- | --- | --- | --- | --- | --- |
| **tenants** — shipped, `getPaginated` | 24 | 1 | 2,668 B | 2,704 B | 2,091 B |
| **tenants** — `data-table` path, `getMany` unbounded | all | 1 | 43,033 B (400 rows) | **542,677 B (5,000 rows)** | 432,677 B |
| contracts | 24 | 2 | 8,472 B | 8,527 B | 6,298 B |
| complexes | 24 | 1 | 1,028 B | 2,244 B | 1,669 B |
| units | 17 | 3 | 6,603 B | 6,059 B | 1,028 B |
| payments | 4 | 1 | 341 B | 349 B | 289 B |

- **No paginated list's query count grows with rows rendered** — every one is a fixed 1, 2 or 3 per page. The tenth page (`offset: 216`) costs 1 query and 2,706 B, the same as the first.
- **`tenant.getMany` with no `limit` returns the entire table** (`src/lib/tenant/router.ts:152-154`), and `useFetchTenants` passes no `limit` at either call site. **One of those call sites is live**: `src/lib/contract/component/form.svelte:253` calls `useFetchTenants(() => ({ enabled: open }))`, so opening the contract form reads all 5,000 tenants — 542,677 B — at the large scale. The other, `src/lib/tenant/component/table.svelte:49`, is on the unreachable path described below. The unbounded read is therefore a **current** cost, not a dormant one.

### Reconcile duration per mutation

`reconcile` timed directly, and `contract.payments.create` timed end to end with the restoring delete excluded. 7 repeats after a warm-up.

| | realistic | large | growth |
| --- | --- | --- | --- |
| `reconcile` alone | 2.62 ms (2.45–3.23) | **40.74 ms** (36.67–45.17) | 15.6× |
| `payment.create`, including its reconcile | 8.02 ms (7.90–8.39) | **48.78 ms** (44.85–51.76) | 6.1× |
| queries — reconcile | 4 | 4 | — |
| queries — `payment.create` | 7 | 7 | — |
| transport — reconcile | 183,802 B | **2,628,275 B** | 14.3× |

- **The query *count* is constant; the payload is not.** `src/lib/contract/reconcile.ts:15-53` issues four unbounded reads — all contracts, all payments, all units, all assignments — plus one `UPDATE` per row whose status actually changed. On a freshly seeded database almost nothing changes, so these figures are reconcile's **best case**; a run that moves many statuses adds one round trip per changed row.
- **One mutation is timed, and that is enough**, because reconcile reads whole tables regardless of what the mutation touched — every one of the eleven call sites pays the same figure. `payment.create` is the exemplar because its own work is the smallest, so what is timed is almost entirely the reconcile.
- **Reconcile also runs at every application start**, from `src/routes/+layout.svelte:176`. Observed once in the browser harness at the large scale, through localhost HTTP rather than IPC, from the `log` middleware's own line: **75 ms**. Single observation, not a median of repeats like every other figure here.

### Scroll frame cost

Real application in Chrome against the seeded database, scrolling each list's virtualized viewport one frame at a time for 180 frames, sampling `requestAnimationFrame` deltas and `long-animation-frame` entries. Each list measured as shipped and again with `backdrop-filter: none !important` on every element. `blurred` counts elements with a live `backdrop-filter` at the moment of measurement — it varies with scroll position because the list is virtualized.

**These are at the large scale only, and at its own seeding.** Unlike every figure above, there is no realistic-scale column: a virtualized list renders a near-constant number of rows whatever the table holds, so the row count moves the data cost and not the frame cost. The trade is that these numbers cannot be compared against a realistic-scale after-measurement. The rows they were taken at are given under **How to reproduce**, and they differ slightly from the table at the top because the frame database was seeded in a separate run.

At **1440×900, no throttling** — every list, both variants:

| List | blurred (shipped) | median | p95 | max | frames > 16.7 ms |
| --- | --- | --- | --- | --- | --- |
| tenants | 36 | 5.9 ms | 6.0 ms | 6.2 ms | 0 |
| contracts | 54 | 5.9 ms | 6.0 ms | 12.5 ms | 0 |
| complexes | 26 | 5.9 ms | 6.0 ms | 6.1 ms | 0 |

At **2560×1440, no throttling**: unchanged — 5.9 ms median, 0 frames over budget, with 42–78 blurred surfaces live.

Under **6× CPU throttling**, where the frame has budget to lose:

| List | viewport | shipped p95 / max / >33 ms | blur-free p95 / max / >33 ms |
| --- | --- | --- | --- |
| tenants | 1440×900 | 23.5 / 29.4 ms / 0 | 29.3 / 29.5 ms / 0 |
| tenants | 2560×1440 | 23.6 / 35.2 ms / 1 | 23.6 / 29.3 ms / 0 |
| contracts | 1440×900 | 41.3 / 47.1 ms / 19 | 53.0 / 70.5 ms / 19 |
| contracts | 2560×1440 | 47.0 / 58.8 ms / 27 | 52.9 / 58.8 ms / 27 |
| complexes | 1440×900 | 35.3 / 41.3 ms / 25 | 35.3 / 41.1 ms / 27 |
| complexes | 2560×1440 | 41.1 / 46.9 ms / 39 | 41.1 / 47.0 ms / 38 |

- **Removing the blur never improved a frame measurably**, at either viewport, throttled or not. Every pair above is one shipped pass and one blur-free pass under identical conditions, so the differences are single-sample and are not a spread — they are reported only as failing to show a cost, and several fall on the wrong side of zero (blur-free measuring worse), which is what a difference below the noise floor looks like.
- **The contract list is the worst scroller under constraint** — 19 of 180 frames over 33 ms at 1440×900 — and it is also the list whose data path does the most per-row work.

## What this contradicts

Both of these are stated as fact in currently-open planning and are wrong against `5a8cee5`. Neither is corrected here; correcting a Decision is not this file's to do. The first is filed as [#222](https://github.com/saud-alnasser/rentable/issues/222).

- **`data-table.svelte` renders no list in the shipped application.** Its only importer is `src/lib/tenant/component/table.svelte`, and *that* file has no importers at all. `src/routes/tenants/+page.svelte:2` renders `tenant/component/data-view.svelte` — the virtualized card grid over `useInfiniteTenants` → `tenant.getPaginated`. So the app ships **five card grids, not four plus a table**. [#219](https://github.com/saud-alnasser/rentable/issues/219) ("the one list already rendering as a table, and it loads every row before sorting, filtering and paginating in the browser"), [#211](https://github.com/saud-alnasser/rentable/issues/211), and ADR 0008 all carry the older reading. The unbounded `getMany` + table-core path is measured above under *data-table path*, because it is the cost ADR 0008 is actually arguing against. Be precise about what is dead: the **component** is unreachable, the **unbounded query behind it is not** — `src/lib/contract/component/form.svelte:253` reaches it on every contract-form open.
- **The blur's cost is a compositing claim, not a measured frame cost.** [#211](https://github.com/saud-alnasser/rentable/issues/211) lists "Zero blurred surfaces inside a scrolling list" among criteria that are "structural and checkable", on the grounds that "`backdrop-filter` forces a compositing pass per surface per frame". The compositing pass is real; its cost did not appear in any frame measurement here, including at 2560×1440 and under 6× CPU throttling. The criterion stands on the aesthetic argument #211 also makes ("elegance here means removing decoration"); it is not supported by these numbers as a *performance* criterion, and stating it as one would make the after-claim unfalsifiable.

## How to reproduce

Two harnesses, both thrown away after the run; they lived under the protocol directory and modified nothing outside it.

**Database-side figures.** A seeder ported from `scripts/seed.ts` with the counts read from the environment (`BENCH_TENANTS`, `BENCH_COMPLEXES`; the two scales above are `400`/`12` and `5000`/`200`), writing a file-backed SQLite database built by applying `tauri/migrations/*.sql` in order. A drizzle client is then built through `createDatabase` from `src/lib/platform/database/client.ts` — the same factory production uses — over a `better-sqlite3` transport wrapped to count queries and weigh `JSON.stringify` of the rows it hands back. The real `appRouter` is driven through `caller(appRouter)(await context({ db, host }))`, with `host` the same fake `settings.get` shape `src/lib/api/testing.mjs` uses. Every figure is the median of 7 repeats after one discarded warm-up. Two departures worth knowing: `console.log` is silenced during timed sections, because the `log` middleware on every public procedure writes a line per call and terminal I/O from Node is not what the webview pays; and `complex.name` is UNIQUE, so complex names are suffixed with an index — faker's street names collide well below 200, which means `scripts/seed.ts` as written cannot seed past roughly 50 complexes ([#223](https://github.com/saud-alnasser/rentable/issues/223)).

**Frame figures.** The unmodified application served by `vite` from a config that adds only two endpoints answering `db_execute_single_sql` and `db_execute_batch_sql` out of a seeded SQLite file. A `window.__TAURI_INTERNALS__` stub is injected through CDP's `Page.addScriptToEvaluateOnNewDocument` — SvelteKit's dev HTML does not pass through vite's `transformIndexHtml`, so a plugin cannot place it early enough. The stub answers the two database commands over those endpoints, returns the smallest `settings`/`bootstrap`/`remote_sync_state_get` shapes that drive startup to `ready`, and returns `null` for everything else. Chrome is launched headed with `--remote-debugging-port` and driven over the DevTools protocol from Node's built-in `WebSocket`; the driver waits for a scrollable list at the expected path rather than for a fixed delay. The frame database was seeded separately at the same large parameters, so its rows differ slightly from the table above: 5,000 tenants, 200 complexes, 2,606 units, 4,452 contracts, 3,826 payments, 6,608 assignments.

## Limitations

- **No Tauri IPC in any number.** The database figures run `better-sqlite3` in process; production sends each query through `invoke` to Rust. Add one IPC round trip per query to every figure — which is why the query counts are reported beside the milliseconds. The frame harness substitutes localhost HTTP for IPC, which is slower than Tauri's channel rather than faster, so it does not flatter the result.
- **Frame cost is bounded from the main thread only.** `requestAnimationFrame` deltas and `long-animation-frame` entries measure main-thread frame pacing. A cost paid entirely on the GPU or the compositor thread would not appear. "Removing the blur changed nothing measurable" is therefore a statement about main-thread frames on GPU-composited Chromium — not a proof that `backdrop-filter` is free. Settling it would take a `Tracing` capture with `disabled-by-default-devtools.timeline.frame`, which was not run.
- **Chromium, not WebView2.** The frame harness runs desktop Chrome 150. WebView2 is the same engine on Windows, but this is not the application's own webview, and the window here has real decorations where the app runs with `decorations: false`.
- **The reconcile figures are its best case.** Seeded statuses are already correct, so almost no `UPDATE` fires. Reconcile after a change that moves many statuses will cost more, by one round trip per changed row.
- **Single run, idle high-end machine.** No repetition across reboots, no thermal variation, no competing load. Run-to-run spread within a single invocation is given as min–max where it matters; spread *between* invocations was not characterised. The frame figures are one pass per condition and carry no spread at all.
- **The harnesses were deleted.** They were Position code, thrown away with the run as the protocol required. **How to reproduce** describes them closely enough to rebuild, but nobody can re-run them as they stood — a second measurement rebuilds the query-counting transport and the CDP driver from that description, and small differences in either would move the absolute milliseconds.
- **The 8-character search term was not tuned to match a fixed number of rows.** For the contract list this is irrelevant — it loads everything regardless — but for the SQL-filtered lists the payload figures depend on how many rows the term matched, and a term matching far more rows would report more bytes.
- Not measured: the dashboard, any detail route, form open/submit latency, cold start to first paint, and memory.
