---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/platform/database/**
  - apps/desktop/tauri/src/database/**
use-when: "a mutation writes more than one table, or atomicity of a multi-step write is in question"
---

# Rule — multi table writes

## A mutation that writes more than one table issues its writes as a single batch

The boundary already runs a batch inside one transaction and commits at the end.

*Why: separate queries leave a half-applied pair with no way back — creating a complex and its
units is one act to the user and must be one act to the database.*

Recorded originally as ADR 0027, *A write that spans tables is one batch, and the batch is the transaction*.
