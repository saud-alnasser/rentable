---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/cell/status.svelte
use-when: "a status is rendered, or a status is added to the model"
---

# Rule — status presentation

## A status renders as an icon carrying no visible text

Its name and its description reach the reader through a tooltip and an accessible label. This
binds every surface showing a status, and every status in the vocabulary of nine carries a
description.

*Why: the row stops spending width on a word most readers recognise by position, and the reader
who does not recognise it gets a full sentence rather than a single word.*

Recorded originally as ADR 0023, *A status is an icon, and its word lives in the tooltip*.
