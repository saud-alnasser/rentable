---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/block/list.svelte
use-when: "a list read is being written, or pagination is proposed for one"
---

# Rule — list reads

## A list issues one query per (search, sort) state and loads the whole result set

`WHERE` from the search, `ORDER BY` from a whitelisted per-list sort key, and no
`LIMIT`/`OFFSET`. The virtualizer renders the viewport out of the full set; a search or sort
change re-queries and scrolls to top. **Do not reintroduce pagination on the read path.**

*Why: there is no server — a SQL-filtered full read of the largest list at realistic scale
measures under a millisecond, and user-chosen sort invalidates an accumulated page cache on
every header click.*

Recorded originally as ADR 0010, *Lists load whole result sets, and pagination is retired from the read path*.
