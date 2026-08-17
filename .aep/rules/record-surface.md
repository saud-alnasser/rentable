---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/design/block/**
  - apps/desktop/src/lib/contract/component/**
  - apps/desktop/src/lib/tenant/component/**
use-when: "a surface showing one record is being built or changed, or where a record's chrome lives is in question"
---

# Rule — record surface

## A record surface is one shell with a per-concept body

The shell owns the chrome and the mechanism — the page frame, the back control, the action
cluster, the title area, and holding the chosen section in the address. **What a record's body
looks like stays with the module that owns the record.** A record's own fields are not one of
its sections.

*Why: the five hand-written record surfaces held a byte-identical loading state, not-found
state, and header arrangement — none of which is the shape of anybody's record.*

Recorded originally as ADR 0032, *A record surface is one shell with a per-concept body*.
