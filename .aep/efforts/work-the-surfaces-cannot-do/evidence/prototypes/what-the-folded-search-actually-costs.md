---
aep: 2.3.0
owner: repository
date: 2026-08-17
kind: prototype
---

# Hypothesis

Folding both sides of the search comparison costs enough at this application's own stated
scale to justify a stored folded column, and that column is the only way to recover the
cost.

The figure the belief rested on is #488's closing note: 70.7 ms at 5 000 rows and 145.9 ms
at 10 000, measured over the contract directory's seven columns, against a seed that
declares 5 000 tenants.

# Falsifier

Either half falsifies it:

- The measured cost against the seeded workspace is small enough that no operator would
  perceive it — taken here as **under ~50 ms**, below which a keystroke-driven list reads
  as immediate.
- Some change that adds no column recovers most of the cost.

# Experiment

Three scripts, run against a copy of the seeded workspace
(`tauri/app.db`, 5 000 tenants / 941 contracts / 591 payments / 80 units), each query timed
over seven runs after a warm-up, through `better-sqlite3` — the same engine build the
application ships, reached the same way the seed script reaches it.

1. The three real search predicates as `#488` shipped them, against a pre-`#488` baseline
   with no folding, against a variant folding only the columns that can hold a character
   the table substitutes.
2. `tenant.name` alone under four storage shapes: folded per row, a backfilled plain column
   (with and without a B-tree index), a `VIRTUAL` generated column, and a `STORED` one.
3. The `STORED` column reached by rebuilding the table, then exercised through an insert and
   an update to see whether it keeps itself in step.

The copies were taken with `VACUUM INTO` rather than by copying the file: the workspace
carried a 4 MB un-checkpointed WAL, and copying `app.db` alone would have measured a stale
database.

# Observation

**The figure in the ticket was measured against the wrong row count.** The seed makes
**941 contracts**, not 5 000 — the 5 000 is its tenant count. The contract directory's real
cost is an order of magnitude below what the note reports.

|                                       | pre-#488 | as shipped | fold only text-bearing |
| ------------------------------------- | -------- | ---------- | ---------------------- |
| contract directory, 941 rows, 7 cols  | 0.6 ms   | 11.2 ms    | 1.8 ms                 |
| tenant directory, 5 000 rows, 3 cols  | 1.4 ms   | 19.6 ms    | 7.5 ms                 |
| payment ledger, 591 rows, 2 cols      | 0.2 ms   | 1.6 ms     | 0.2 ms                 |

`tenant.name` alone, under each storage shape:

| shape                              | cost   |
| ---------------------------------- | ------ |
| folded per row, as shipped         | 7.0 ms |
| `STORED` generated column          | 0.4 ms |
| backfilled plain column            | 0.3 ms |
| the same, with a B-tree index      | 0.3 ms |
| `VIRTUAL` generated column         | 7.5 ms |

Four things surprised:

- **The index buys nothing.** `explain query plan` reports
  `SCAN tenant USING COVERING INDEX tenant_name_folded_idx` — a scan, not a seek. A
  leading-wildcard `LIKE` cannot seek a B-tree, so every shape here is O(rows) and the only
  thing a column removes is the per-row `replace()` work.
- **SQLite refuses `ALTER TABLE ADD COLUMN … STORED`** (`cannot add a STORED column`). A
  stored generated column arrives only by rebuilding the table. drizzle-kit 0.31.10 does
  emit those rebuilds — `recreate_table`, `PRAGMA foreign_keys=OFF`, `__new_` tables, read
  from its own bundle — and the rebuild cost 38 ms for 5 000 rows.
- **A `VIRTUAL` generated column is not an optimisation at all.** It is computed on read,
  so it measures as the expression it replaces.
- **Seven of the twelve searched columns cannot hold a character the table folds, and this
  is enforced rather than conventional.** `identity` is `/^[12]\d{9}$/` and `phone` is
  `/^(\+9665)…([0-9]{7})$/`, so neither column can hold an Arabic-Indic digit; `status` and
  `interval` are enums; `cost`, `amount` and `tenant_id` are numeric; and the ledger's day
  is a computed `strftime()` expression rather than a column, so it could not carry a twin
  even if one were wanted. Folding any of them on the stored side is provably identity work.

The `STORED` column, where one is wanted, does keep itself correct with no write-path code:
inserting `إبراهيم الأنصاري` stored `ابراهيم الانصاري`, updating the row to `آمنة` moved the
twin to `امنه` by itself, and searching `امنه` then found the row.

# Result

**Refuted, on both halves.**

The measured worst case is 19.6 ms rather than 145.9 — under the 50 ms falsifier by a wide
margin. And folding only the five columns that can hold a foldable character recovers most
of the cost with no column at all: 6× on the contract directory, 2.6× on tenants, 8× on the
ledger.

# Conclusion

**Search normalization stays inside the existing schema.** The effort's Data Model holds:
the history journal remains its only schema change.

The cost is removed by asking the schema which columns can hold a substitutable character,
not by storing a second copy of them. Where a column is ASCII by validation, the stored side
needs no folding; the *term* still folds always, which is what makes a search typed in
Arabic-Indic digits find a row stored in ASCII ones.

**A stored twin is not rejected forever, and the condition for revisiting it is a number:**
a real workspace whose tenant directory exceeds roughly 30 000 rows, at which point the
column-typed comparison would pass 50 ms on this hardware. Should that arrive, the shape to
reach for is a `STORED` generated column — never a backfilled one kept in step by write-path
code, which is the failure `search.ts`'s own header warns against, and never a `VIRTUAL` one,
which does nothing.

# Disposition of the code

Deleted — three throwaway benchmark scripts under the session scratchpad, never in the
repository, along with the two database copies they vacuumed out.

The idea promoted is **fold-relevance belongs to the schema**: a searchable column declares
whether its stored side can hold a substitutable character, and the comparison reads that
declaration. Nothing else survives; what ships is written fresh against the tree.
