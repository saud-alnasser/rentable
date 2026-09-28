---
status: resolved
blocked-by: [17, 18]
---
# refactor(desktop): a capability's shared components are reached through its ui entry

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The human decided on 2026-09-28 that a capability's components are rendered by other concepts only through a `ui.ts` beside its `index.ts`, which re-exports by name the components it shares; `component/` stays private and `index.ts` stays loadable under Node (plan, *Architecture* and *The canonical concept shape*). The layer test learns the rule: an import of `$lib/<capability>/ui` is an entry import, an import of `$lib/<capability>/component/...` from outside that capability stays `deep`. `list/` and `create/` gain their `ui.ts`, every feature and shell import of their components goes through it, and the `deep` lines those imports carried leave the baseline. Any other capability whose component is imported from outside it today gets the same treatment.

## Acceptance Criteria

Traces requirements 4 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 20.

- [x] The layer test treats `$lib/<capability>/ui` as an entry and still reports an outside import of a capability's `component/` as `deep`; a scratch import of `$lib/list/component/list.svelte` from a feature fails it (criterion 4). Verified: `layers.test.ts` passes on the tree; a scratch `tenant/component/scratch.svelte` importing `$lib/list/component/list.svelte` failed it with `+ 'tenant/component/scratch.svelte -> list/component/list.svelte : deep'`; scratch removed.
- [x] No file outside a capability imports that capability's `component/`; the baseline holds no `-> <capability>/component/` line (criteria 4 and 20). Verified: a search of `apps/desktop/src` for `$lib/<capability>/component/` outside each capability finds only data labels in `design/tests/capitalize.test.ts`; `grep -E -- "-> (list|create|history|print|shortcut|notification|act|form|date|permission|mutation|undo|palette|transfer)/component" layers.baseline.txt` prints nothing (21 deep lines removed). `ui.ts` exists in list, create, history, print, shortcut and notification.
- [x] [[rules/module-layout]] states the `ui.ts` entry in the canonical layout. Verified: `rules/module-layout.md` gains a section stating the `index.ts`, `ui.ts` and private `component/` entries; `validate.mjs` exit 0.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/tests/layers.test.ts`, `src/lib/list/`, `src/lib/create/`, their importers

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency baseline in the same commit.
