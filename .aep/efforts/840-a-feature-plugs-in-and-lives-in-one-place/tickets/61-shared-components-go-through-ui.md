---
status: open
blocked-by: [17, 18]
---
# refactor(desktop): a capability's shared components are reached through its ui entry

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The human decided on 2026-09-28 that a capability's components are rendered by other concepts only through a `ui.ts` beside its `index.ts`, which re-exports by name the components it shares; `component/` stays private and `index.ts` stays loadable under Node (plan, *Architecture* and *The canonical concept shape*). The layer test learns the rule: an import of `$lib/<capability>/ui` is an entry import, an import of `$lib/<capability>/component/...` from outside that capability stays `deep`. `list/` and `create/` gain their `ui.ts`, every feature and shell import of their components goes through it, and the `deep` lines those imports carried leave the baseline. Any other capability whose component is imported from outside it today gets the same treatment.

## Acceptance Criteria

Traces requirements 4 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 20.

- [ ] The layer test treats `$lib/<capability>/ui` as an entry and still reports an outside import of a capability's `component/` as `deep`; a scratch import of `$lib/list/component/list.svelte` from a feature fails it (criterion 4).
- [ ] No file outside a capability imports that capability's `component/`; the baseline holds no `-> <capability>/component/` line (criteria 4 and 20).
- [ ] [[rules/module-layout]] states the `ui.ts` entry in the canonical layout.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/tests/layers.test.ts`, `src/lib/list/`, `src/lib/create/`, their importers

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency baseline in the same commit.
