---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/complex/component/**
  - src/lib/contract/component/**
use-when: "a unit is being listed, or units are being assigned to a contract"
---

# Rule — unit presentation

## Units read as directory rows wherever they appear

A unit met in a complex and a unit met in a contract are the same record and read the same way.
Assigning units is a write, and a write takes the shared form surface — never a bespoke panel
embedded in a surface that reads.

*Why: one concept reading two ways depending on which tab was opened forces the reader to learn
a second vocabulary for a record they already know.*

Recorded originally as ADR 0024, *Units read as a directory, and assigning them is a form*.
