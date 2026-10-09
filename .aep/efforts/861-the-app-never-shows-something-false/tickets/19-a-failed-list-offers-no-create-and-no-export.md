---
status: open
---

# fix(desktop): a failed list offers no create and no export

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 1: a failed read never draws a create offer; criterion 1), and ticket 03. Found at review round 1 (correctness).

## Outcome

While a list's read has failed, its toolbar offers neither create nor export, so the list makes no offer and no statement about a set it could not read; once the read answers, both return as before.

## Acceptance Criteria

Traces requirement 1 and criterion 1 (the lists).

- [ ] The list shell draws no toolbar create and no export control while `failed`; `list/tests/list-empty.svelte.test.ts` asserts both are absent on a failed read and present after it answers, replacing the case that kept the toolbar's create.
- [ ] No export control anywhere reads *nothing to export* for a read that failed.
- [ ] [[rules/interface]], under *Empty* (the failed situation), says the toolbar offers no create and no export while a read has failed.

## Relevant areas

- apps/desktop/src/lib/list/component/list.svelte, list/component/list-toolbar.svelte, list/tests/
- .aep/rules/interface.md

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
