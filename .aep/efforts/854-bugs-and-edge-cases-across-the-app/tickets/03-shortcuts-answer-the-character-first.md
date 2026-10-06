---
status: open
---

# fix(design): shortcuts answer the character the layout produces

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *14*).

## Outcome

A shortcut matches the character the keyboard layout produces first, and falls back to the physical key only where the layout produces no Latin letter, so Ctrl+Y never undoes on QWERTZ and every shortcut still works on the Arabic layout.

## Acceptance Criteria

Traces requirement 14 and criterion 14.

- [ ] `matchesShortcutKey` in `packages/design/src/lib/shortcut.ts` follows the plan's three steps.
- [ ] node tests: `key: y, code: KeyZ` with Ctrl does not undo; `key: w, code: KeyZ` does not undo; an Arabic-layout Ctrl with `code: KeyZ` undoes; Ctrl+Shift+`Z`, every row of the plan's Arabic table, `ArrowDown` and `Enter` all match.

## Relevant areas

- `packages/design/src/lib/shortcut.ts` and its tests

## Constraints

- The changeset is for `@rentable/desktop` if the design package releases through it; read [[references/changesets]] for which package carries it.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
