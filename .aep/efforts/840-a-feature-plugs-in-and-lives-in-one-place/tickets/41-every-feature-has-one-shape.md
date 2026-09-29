---
status: resolved
blocked-by: [40]
---
# refactor(desktop): every feature and capability has one shape and an entry

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each feature and capability has an `index.ts` re-exporting only Node-loadable modules, and follows the canonical shape of the plan (*Components*). Every cross-module import goes through an entry. [[rules/module-layout]] states the shape and the layer rule. The TypeScript baseline is empty.

## Acceptance Criteria

Traces requirements 4 and 6 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 6.

- [x] The dependency test's baseline is empty (criteria 4 and 5). Verified: `apps/desktop/src/lib/tests/layers.baseline.txt` holds no violation line (all 248 gone: 139 cycles, 82 deep, 25 literal, 1 upward, 1 import); the layer and naming tests print `pass 10 / fail 0`. Every feature and capability reaches another through `index.ts` (Node-loadable) or `ui.ts` (window-side), per the human's decision of 2026-09-29.
- [x] [[rules/module-layout]] states the canonical shape and lists each deviation with its reason (criterion 6). Verified: `rules/module-layout` states the four layers, the canonical concept shape with both entries, the kind rule, and a deviations table with each row's reason (notification and undo, whose `index.ts` loads only with svelte-sonner mocked, among them); `validate.mjs` exit 0.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, vitest `623 passed` (on its own), build:web 0, `cargo test --lib` 645 passed, validate 0; node tests fail only the date-dependent receipt test. `receipt.svelte` writes the tenant's `<dt>` out with the same class and `data-receipt-label` the `fact` snippet drew; tests changed only by two import paths.

## Relevant areas

- `src/lib/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
