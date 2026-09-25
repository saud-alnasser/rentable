---
status: resolved
---

# fix(design): a record card is tinted under the pointer, not lifted

## Outcome

A record card in any list answers the pointer, keyboard focus and a press with a muted fill, and
no longer lifts or deepens its shadow.

## Acceptance Criteria

Traces requirement 14 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]].

- [x] `recordCard` carries no transform and no hover shadow, and tints on hover, focus and press
      (criterion 14; `packages/design` tests, including the reduced-motion sweep, pass 158 and 28
      files; the desktop's 61 component files pass).
- [x] [[rules/frontend]] no longer names a lifted card among what floats (`shadow-overlay`).
