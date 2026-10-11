---
status: resolved
---

# fix(design): a toast's action is drawn in the toast's tone

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 9: every toast reads on its wash). Found by the owner in the staged window: the undo and redo buttons on a toast look plain.

## Outcome

Undo and redo on a toast read as buttons of that toast: the label and a hairline outline in the toast's tone, a pill like the app's buttons, firmer under the pointer.

## Acceptance Criteria

Traces requirement 9.

- [x] The action is drawn in the toast's tone. Verified: staged state 13 (undo on a toast) shows undo on the success toast as a green outlined pill, in English and Arabic, light and dark; before, sonner drew it as a chip in the reverse of the popover whatever the tone.
- [x] Its label still reads at 4.5:1. Verified: it has no fill of its own and no state paints one, so it sits on the wash the toast text is held to; `tokens.test.ts` holds both, and packages/design passes 212 of 212.

## Relevant areas

- packages/design/src/lib/primitive/sonner/sonner.svelte, packages/design/src/lib/tests/tokens.test.ts
