# Lists load whole result sets, and pagination is retired from the read path

There is no server: every list reads a local SQLite file whose row counts are bounded by one
operator's portfolio, and the measured baseline puts a SQL-filtered full read under a
millisecond and around 110 kB for the largest list at realistic scale. A list therefore
issues **one query per (search, sort) state** — `WHERE` from the search, `ORDER BY` from a
whitelisted per-list sort key, no `LIMIT`/`OFFSET` — and the virtualizer renders the viewport
out of the whole result set; a sort or search change re-queries and scrolls to top. The
offset-cursor infinite query shipping before this decision solved a hosted product's problem
this application does not have, and user-chosen sort (decision 03) would have invalidated its
accumulated pages on every header click.

## Considered Options

- **Offset pages with sort in the query key** — bounded ~8 kB per interaction at any scale,
  but keeps cursors, page accumulation and the load-more observer, and needs a `COUNT` query
  for the result count the whole set gives free.
- **A capped hybrid** — whole set below a row threshold, pages above it — ships two models
  forever for a scale no real portfolio reaches.

## Consequences

- Search and sort are answered in SQL; the loaded set is never re-filtered, re-sorted or
  re-paginated on the client. Matches cross the IPC boundary, never whole tables.
- Full-table transport on empty search is accepted: ~1.5 MB once per state change at the
  baseline's deliberately-implausible 14× stress scale
  (`.claude/evidence/research/interface-performance-baseline.md`).
- This covers the five lists. The contract form's unbounded tenant read is a form question
  and is not licensed by this decision.
