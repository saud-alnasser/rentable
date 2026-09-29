---
status: open
---
# refactor(desktop): type imports go through entries, and the refusal list lives in the composition root

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Review round one (standards): the layer guard exempts every `import type`, while `rules/module-layout` has no such exemption and `rules/frontend` says a type-only import is a reach; 20 type imports point up and 31 reach past an entry. Types pointing up to the composition root are how the client is typed from the list (`AppRouter`, `SurfaceContributions`, the feature list), so that exemption is written into `rules/module-layout`'s departures with its reason and `rules/frontend` agrees; every other type import obeys the entry rule, and the guard counts type imports for past-an-entry and for a feature named outside its own files. `api/refusal.ts`'s per-feature union moves to the composition root, the one place that names every feature.

## Acceptance Criteria

Traces requirements 2, 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2, 4 and 5.

- [ ] The layer test counts type-only imports for the deep and feature-naming kinds, and only an upward type import of the composition root is exempt, written in `rules/module-layout` and `rules/frontend` alike (criteria 4 and 5).
- [ ] The baseline stays empty; no file below `app/` lists the features' refusal codes (criterion 2).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/tests/layers.test.ts`, `src/lib/api/refusal.ts`, `src/lib/app/`, `.aep/rules/module-layout.md`, `.aep/rules/frontend.md`

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
