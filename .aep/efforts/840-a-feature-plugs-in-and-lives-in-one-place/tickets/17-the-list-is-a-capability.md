---
status: resolved
blocked-by: [12]
---
# refactor(desktop): the list is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/block/list.svelte`, `list-toolbar.svelte`, `search-field.svelte`, `design/list-keyboard.ts`, `list-motion.ts` and `filter.ts` become `src/lib/list/`. `list.svelte` (1,293 lines) is split along the concerns it mixes while it moves.

## Acceptance Criteria

Traces requirements 17 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 17 and 20.

- [x] No list machinery remains in `design/` (criterion 20). Verified: `ls src/lib/design src/lib/design/block` lists `cell/`, `import.ts`, `inverse*`, `mutation.ts`, `query.ts`, `undo-shortcut.ts` and `block/language-choice.svelte`: no list, toolbar, search field, keyboard, motion or filter module remains.
- [x] No file in `list/` passes 500 lines (criterion 17). Verified: `find src/lib/list -type f | xargs wc -l`: the largest file is `list/component/list.svelte` at 399 lines (then `keyboard.ts` 231, `focus.svelte.ts` 229); every test file is under 260.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after the child rebased onto 1f4d02ab: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0. Test changes are import paths, and the capitalize allowlist entry for `list.svelte` (4 uses) split into `filter-menu.svelte` and `transfer-menu.svelte` (2 each), since those uses moved with the split.

## Relevant areas

- the files named

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
