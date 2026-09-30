---
status: resolved
blocked-by: [01]
---
# refactor(desktop): shortcuts are a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/shortcut-registry.ts` and `.svelte.ts` become `src/lib/shortcut/` with an `index.ts`; the one listener is its own.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [x] Every shortcut registration goes through `$lib/shortcut` (criterion 20). Verified: a search of `apps/desktop/src` (tests aside) for `shortcuts.register(` and `new ShortcutRegistry(` finds six `shortcuts.register` calls (list, search-field, create-shortcut, palette, sidebar, undo-shortcut), each file importing `shortcuts` from `'$lib/shortcut'`, and one `new ShortcutRegistry` inside `shortcut/shortcut.svelte.ts`; the only window key listener in the app and the design package is `shortcut/component/listener.svelte:28`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test (`git diff -- '*.test.ts'` shows only import paths).

## Relevant areas

- `src/lib/design/shortcut-registry*.ts` and their importers

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
