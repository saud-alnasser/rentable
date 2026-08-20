---
aep: 2.7.0
owner: repository
date: 2026-08-20
kind: research
---

# Question

A contract's attention rank is decided from what it owes today, which no column holds, so a
rank-filtered list cannot be a plain `where`. What should replace reading every contract and
narrowing in the client — expressing the rank in SQL, paging the result, or something else?

# Sources

- `apps/desktop/src/lib/contract/router.ts`, `contract.getMany`, read 2026-08-20. The list as it
  stood: one query with no rank term, then a `flatMap` computing the rank per row.
- `apps/desktop/src/lib/contract/rank.ts` and `contract.ts`, read 2026-08-20, for what a rank is
  decided from and what the cycle arithmetic does.
- `apps/desktop/src/lib/platform/database/schema.ts`, read 2026-08-20, for which aggregates are
  stored: `paid_amount` and `expected_amount` both are.
- The development workspace replica, measured 2026-08-20 through `@tursodatabase/sync` 0.7.2 —
  the engine the application ships — on a copy of the file rather than the live one. It holds
  5000 tenants, 1138 contracts and 647 payments. Five runs per statement after a warm-up, best
  and median reported.

# Findings

**observation** — The list read every contract for every rank. Measured at **67.0ms best,
67.8ms median, 1138 rows** for the list query as it stood, ordering included.

**source** — The rank is `getContractRank(status, end, outstandingAmount, now, noticeDays)`, and
`outstandingAmount` is `getExpectedAmountBy(contract, now) - paidAmount`. `getExpectedAmountBy`
counts cycles by stepping a date forward one interval at a time, and the total it is capped
against is found by a search over cycle counts with a tolerance in days.

**interpretation** — Expressing that in SQL is not a translation of one expression. It is
calendar-interval arithmetic and a bounded search, in a second language, against a rule that
already has one rendering in TypeScript that every other reader of a rank uses. Two renderings
that must agree about money is the failure this repository avoids elsewhere by construction.

**observation** — Every rank does put conditions on stored columns alone:

| Rank | Status | Balance | End date |
| --- | --- | --- | --- |
| overdue | not terminated | `paid_amount < expected_amount` | before today |
| owing | not terminated | `paid_amount < expected_amount` | today or later |
| ending-soon | active or fulfilled | none available | within the notice window |

**interpretation** — These are necessary, not sufficient. A contract can satisfy all of them and
be in no rank. So they narrow to a superset of the rank rather than to the rank.

**conclusion** — The balance condition is sound because the two stored aggregates bound each
other: what a contract is expected to have paid *by today* can never exceed what it is expected
to pay over its whole term, so owing anything today implies the total is unsettled. The converse
does not hold and is not claimed. Pinned by a test sweeping every interval against days before,
inside, on and past the term.

**observation** — Narrowing on those bounds, measured the same way:

| Read | Best | Median | Rows read | Rows shown |
| --- | --- | --- | --- | --- |
| whole table, then narrow in the client | 67.0ms | 67.8ms | 1138 | varies |
| bounded, overdue | 3.9ms | 3.9ms | 65 | 65 |
| bounded, owing | 4.1ms | 4.2ms | 67 | 15 |
| bounded, ending soon | 1.1ms | 1.1ms | 17 | 8 |

**interpretation** — Seventeen times faster on the money ranks and sixty on renewals, and the
rows read now track the rank rather than the table. The superset costs between nothing and
four-and-a-half times what is shown, on this workspace: `owing` reads contracts that have not
settled their total but are current on what is due so far, which is most of a healthy portfolio
mid-term.

**observation** — The bounded reads land near the 3.4ms that requirement 18 measured for the
same query with `paymentCount` removed entirely, while `payment.contract_id` is still unindexed.

**interpretation** — The correlated payment count is charged per row read, so narrowing the read
narrows it too. This does not settle the unindexed column: the *unfiltered* contracts directory
still reads 1138 rows and still pays 60.7ms for the count, which is what criterion 18 is about.

**source** — [[rules/data]], under the list read: `WHERE` from the search, `ORDER BY` from a
whitelisted sort key, and **no `LIMIT`/`OFFSET`** — *do not reintroduce pagination on the read
path*, recorded as ADR 0010. Read 2026-08-20.

**conclusion** — Paging was never open here, and the spec saying it was is wrong about this
repository. The rule refuses it on the read path outright, and the same passage says what the
answer is instead: *the declared filters that narrow the read in SQL are exactly what stops a
whole-result-set read being billed as a full-table scan*. Narrowing is the sanctioned move.

**interpretation** — Paging would also not have worked on its own merits, which is worth
recording so it is not re-proposed as a way around the rule. A page is a window over rows a query
has already selected, and until the rank narrows the query there is nothing to window: paging the
unranked table would return pages holding no members of the rank at all, and a reader would see
an empty list beside a count saying otherwise.

# Conclusion

Narrow the query on the conditions a rank implies about stored columns, and let the existing
ranking decide what comes back. The rank keeps one rendering; the read stops scaling with the
table.

Expressing the rank in SQL lost, on the grounds that it duplicates cycle arithmetic about money
in a second language. Paging was not eligible: [[rules/data]] refuses `LIMIT`/`OFFSET` on the read
path, and it would not have worked anyway, having nothing to page until the query narrows.

**The spec offers paging as an open option and should not.** Requirement 18 says *expressing the
rank in SQL and paging the result are both open, and the second is available even if the first is
not*, which contradicts [[rules/data]]. Nothing was built on that line — this took the narrowing —
but the line is still there for the next reader.

# Not checked

- Whether the superset stays this close to the rank on portfolios shaped differently from this
  one. The `owing` ratio of four-and-a-half is a property of how much of this workspace is
  mid-term, not a bound.
- The debug build. Every figure here is from the release-built engine, and the application ships
  a debug build in development, which is slower by an unmeasured factor.
- Whether an index would help the bounded reads further. They are still scans, over a table small
  enough that at this size it does not show.
