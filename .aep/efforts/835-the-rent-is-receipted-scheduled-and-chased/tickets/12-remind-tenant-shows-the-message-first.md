---
status: resolved
blocked-by: [11]
---

# feat(contract): remind tenant shows the message first

## Outcome

The reminder act is *remind tenant*, beside *print*, and it opens a small panel showing the
message with an Arabic/English choice (starting on the application's language) and one act, *open
WhatsApp*.

## Acceptance Criteria

Traces requirement 12 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], as
revised on 2026-09-25, and criterion 12.

- [x] The act is labelled *remind tenant* in English and its Arabic equivalent, and sits right after
      *print* in every projection (criterion 12(c), acts test).
- [x] The panel shows the message in the application's language; switching redraws it in the other;
      *open WhatsApp* opens the address with the message in the chosen language (criteria 12(a),
      12(b), component test).
- [x] The landing row still carries the act.
