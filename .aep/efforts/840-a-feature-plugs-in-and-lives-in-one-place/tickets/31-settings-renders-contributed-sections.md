---
status: resolved
blocked-by: [27]
---
# refactor(desktop): settings renders the sections features contribute

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`settings/component/area.svelte` renders the sections surfaces declare `on: 'settings'`; the organization contributes its panels and `settings/` imports nothing from `organization/`.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [x] `settings/` imports no `organization` module; the baseline loses `settings -> organization : cycle` and every `settings/... -> organization/...` line (criteria 4 and 5). Verified: a search of `src/lib/settings` for any organization import prints nothing; the baseline has no `settings -> organization` line (the organization's account, organization and workspaces panels are sections it contributes `on: 'settings'`, handed to the area by its route). `organization -> settings : cycle` remains through the longer paths the note names.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after merging `settings/component/area.svelte`, its test and `contexts/repository.md` with ticket 24 and repointing two test imports to `sync/host` and `sync/tests`: check 0, eslint 0, `pnpm test` 3 of 3 tasks (including the hidden-section `load` test), build:web 0, validate 0. The area test moved to `app/tests/` with assertions unchanged; `sectionsFor` assertions changed signature.

*Narrowed on 2026-09-29 at integration: `organization -> settings : cycle` remains only through longer paths that do not start in `settings/` (settings to dashboard to contract to organization; update to sync to workspace to organization), which converge checks against criterion 5.*

## Relevant areas

- `src/lib/settings/component/area.svelte`, `src/lib/organization/component/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
