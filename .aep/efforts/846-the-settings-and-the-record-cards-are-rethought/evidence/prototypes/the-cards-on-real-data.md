---

---

# What does each concept's tile hold, and how tall is it, on the development workspace?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2 (WebView2), `@rentable/design`'s `record-card`
tile layout and `Cell.Status`'s labelled form from ticket 14, `columnsFor` with
`RECORD_TILE_MIN_WIDTH = 300`, in the running desktop application signed in as the owner on the
development workspace (5,000 tenants, 10 complexes, 1,164 contracts), 2026-10-02.

Conclusion: **tenant 144, complex 120, contract 184. Units stay rows.** All three fixed heights
are larger than or equal to the plan's starting values (136, 120, 152), because a fact line in
Arabic is 22 px at the inherited leading and the contract card names its units. Each tile now
sets its own line height so both locales draw one height.

Consumed: [[rules/interface]], under *The visual reference*, *List presentation* and *Status
presentation*; _Refactoring UI_, read as extracted text (`pdftotext`; the page images do not
render here): *Not all elements are equal* (36), *Size isn't everything* (38), *Labels are a last
resort* (48), *Balance weight and contrast* (56), *Avoid ambiguous spacing* (96).

## Hypothesis

The plan's table holds: the four concepts' cards fit the starting heights (tenant 136, complex
120, unit 104, contract 152) with the facts it lists, in both languages, at one, two and three
columns.

## Falsifier

Any real record whose tile, drawn with the listed facts, is taller than its declared height in
either locale (the rows do not clip, so it would overlap the card below), or a concept whose tile
the human reads as wrong for it.

## Experiment

Tile components for the four concepts were built beside `src/lib/prototype/switcher.svelte`,
drawn through the live query hooks (`useListTenants`, `useListComplexes`, `useListUnits` on the
complex holding the most units, `useListContracts`, and `useFetchContractUnits` for each contract
card) inside the real `List` shell with `recordMinWidth = 300`. They were mounted over the
running window's content area in the effort's run tree, and a `cards-846` switcher stepped
between the concepts. Everything was driven over the WebView2 debug port: the switcher's step,
the readout (`n/4 · concept`) read back before every capture, `settings_set` for locale and
appearance (restored to `en` / `system` afterwards), and window widths set from outside with
Win32 `MoveWindow`.

Each tile's natural height was measured by releasing the fixed height (`height: auto` on every
drawn tile) and reading the tallest, in every combination below.

## Observation

**Heights.** Natural tallest tile, in pixels:

| Concept | en, first draw | ar, first draw | en and ar, fixed leading |
| --- | --- | --- | --- |
| tenant | 138 | 151 | 144 |
| complex | 116 | 123 | 120 |
| contract (with units named) | 186 | 202 | 184 |
| unit | 88 | not taken further | not taken further |

The first draw overflowed the plan's heights: the contract tiles visibly overlapped the row below
at 152. Arabic was taller on every concept because a `text-xs` line inherits Readex Pro's leading
(21.6 px against 16 px in English). Giving each fact line `leading-5` (20 px) and the two money
lines 18 px made the heights identical in both locales: every combination in the matrix below
measured the fixed value exactly, with no tile taller.

**What the data holds.** No tenant holds contracts in more than two statuses (3,970 hold none,
961 one, 69 two), so a tenant's chips always fit one line at the minimum width. Complexes hold 2
to 19 units. A sample of 400 contracts held one or two units each (two held none), the longest
naming being `Room 17, Room 19`. The government id is a 36-character UUID, which fits on its own
line at the minimum width and fits no other fact beside it.

**Columns.** Window 640 px: one column. 1,000 px: two (the sidebar drawn). 1,300 px: three. The
tile was 324 to 345 px wide at two and three columns, and 585 px at one.

**The human's verdict on the prototype**, verbatim: "in prototype iliked all cards 846 views
execpt the units view feels ood since they are accessed via contract or complex also they feel to
much space they occupie for no reason".

## Result

Refuted for every concept on height. Refuted for units on form: a unit is reached through its
complex or its contract, and a tile spends space a unit's two facts (status and occupant) do not
need. The orchestrator's design call from the human's words: the units directory keeps the
compact row; at most its row takes the icons and the labelled status, where that fits the
existing row height.

## Conclusion

What each card holds, in the order drawn. A fact is a muted `text-xs` line at `leading-5` with a
`size-3.5` icon at reduced opacity, so the icons do not outweigh the words (*Balance weight and
contrast*). A count carries its word rather than a label (*Labels are a last resort*). The name is
the one semibold line (*Size isn't everything*). The facts sit four pixels apart and the bottom
line is pushed to the tile's foot, so the facts read as one group (*Avoid ambiguous spacing*).

| Concept | `recordHeight` | Heading | Facts | Foot |
| --- | --- | --- | --- | --- |
| tenant | **144** | name | national id (`id-card`, ltr), phone (`phone`, ltr) | a chip for each status with contracts: glyph, figure and word, in the status's tone; *no contracts* (`file-text`, muted) when all are zero |
| complex | **120** | name | location (`map-pin`) | `layout-grid` *n units*, occupied glyph *n occupied* (primary), vacant glyph *n vacant*, each left out at zero |
| contract | **184** | tenant name (or the reference), labelled status | reference (`hash`, ltr), dates (`calendar-range`), units' names (`layout-grid`), the units line left out when the contract holds none | the ring, then *paid / expected* over *cost · interval* at 18 px leading, then `banknote` *n payments* when above zero |
| unit | stays a row, 64 | | | |

For tickets 16 to 18:

- **Contract units are a read change.** The prototype fetched each card's units separately; ticket
  18's `contract.getMany` must return the names, as the plan says. The names need joining with
  the locale's list separator: the prototype's `, ` reads wrongly in Arabic.
- **Counts need plural strings with their word.** The prototype set the figure beside a bare
  word, which gave *1 payments* and *1 المدفوعات*. Each concept ticket owns proper plural
  strings: tenant per status, complex for units, occupied and vacant, contract for payments, and
  *no contracts*.
- **The line height is part of the height.** A tile's facts must set their own leading. Without
  it, Arabic is 7 to 18 px taller than English and overlaps the card below.
- **Units stay rows** (ticket 17 then covers complexes as tiles and the unit row's treatment only).

Screenshots, in `the-cards-on-real-data/`, named `<concept>-<locale>-<appearance>-w<window
width>.png`:

- three columns (`w1300`): all three concepts in `en` and `ar`, light and dark;
- two columns (`w1000`) and one column (`w640`): all three in `en-light` and `ar-dark`;
- `unit-en-dark-rejected.png`: the unit tile the human turned down.

## Disposition of the code

Deleted, from the run tree and from this ticket's worktree; nothing of it was committed. What
ships is rewritten in each concept's own card component by tickets 16 to 18, from the table
above.
