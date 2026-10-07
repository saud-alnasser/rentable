---
status: resolved
---

# fix(desktop): the interface no longer crashes reading toLowerCase

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]] (*Duplicates never cost a record*).

## Outcome

During the human's test of this branch on 2026-10-07 the dev log recorded `[Unhandled error] TypeError: Cannot read properties of undefined (reading 'toLowerCase')` in the client. Its cause is found and fixed.

## Acceptance Criteria

Traces requirement 8 and requirement 11.

- [x] The cause is found from the code (every `.toLowerCase()` reachable in the flows of this effort: update, switcher, held screen, sync, roles) and recorded in Notes with the path that reaches it with an undefined value.
- [x] A test that fails first reproduces it, and passes after the fix.

## Relevant areas

- apps/desktop/src/lib/

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.

## Notes

**Cause.** The dev log printed a stack after the error line, and it pins the path: `handleKeydown` (`apps/desktop/src/lib/shortcut/component/listener.svelte:12`) → `Shortcuts.answering` (`shortcut.svelte.ts:53`) → `ShortcutRegistry.answering` (`shortcut.ts:184-188`) → `matchesShortcut` → `matchesShortcutKey` (`packages/design/src/lib/shortcut.ts:51`), at `event.key.toLowerCase()`. The undefined value is the keydown's `key`, not a flag, reason, release field, locale or machine name. Chromium (WebView2 here) sends the window a plain `Event` named `keydown`, with no `key` or `code`, when a remembered sign-in is picked from the autofill list. The human signed in through a remembered session in that run. The code predates this effort (#793 and #855); the effort's flows only reached it through the sign-in fields.

**Fix.** `matchesShortcutKey` takes a keydown whose key and code are optional, and a keydown without a key matches no shortcut. The test `a keydown that carries no key is no shortcut, and does not throw` in `packages/design/src/lib/tests/shortcut.test.ts` failed first with the logged `TypeError`.

**No changeset.** Nothing here is observable to a user: the throw only cut short a keydown that no shortcut answered.
