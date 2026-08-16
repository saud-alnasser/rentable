---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - src/lib/design/block/field-error.svelte
  - src/lib/design/primitive/form/**
use-when: "a form reports validation errors"
---

# Rule — validation errors

## A validation error marks its own field

Use the shared field-error treatment: the destructive border and ring the control primitives
already draw from `aria-invalid`, an icon on the label line, and the message revealed on hover
or focus. **No form places a summary callout listing every message.**

*Why: a summary names the problem and never the field, so the reader has to map the message
back to a control themselves — and that mapping gets harder exactly as the form gets longer.*

Recorded originally as ADR 0018, *A validation error belongs to its field, not to a summary the surface places*.
