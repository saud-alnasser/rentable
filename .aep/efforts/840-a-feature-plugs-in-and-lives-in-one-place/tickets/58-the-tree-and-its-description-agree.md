---
status: resolved
blocked-by: [57, 41]
---
# docs(aep): the tree and its description agree

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every rule's and context's `paths:` glob matches the tree, a test holds that, [[contexts/repository]] lists the homes and the four layers as they are, and one artifact lists what adding a feature touches; the naming baselines are empty. The list is checked by adding a throwaway record kind in a scratch branch and counting the files it touched.

## Acceptance Criteria

Traces requirements 2, 14 and 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2, 14 and 18.

- [x] A test fails on a `paths:` glob matching no file (criterion 18). Verified: `apps/desktop/src/tests/governance.test.ts` reads every `paths:` glob in `.aep/rules/*.md` and `.aep/contexts/**/*.md` and matches it against `git ls-files`; it failed on two dead globs (`apps/desktop/tauri/migrations/**`, a gitignored mirror since #593), which were corrected, and now passes with the layer and naming guards (`pass 13 / fail 0`) in the desktop node suite.
- [x] `validate.mjs` passes (criterion 18). Verified: `node .aep/scripts/validate.mjs` printed `488 artifacts checked, no failures`.
- [x] A throwaway kind was added and reverted, and the commit body and `rules/module-layout` list every file it took (criterion 2). Verified: a throwaway `parcel` kind (router, feature, surface, page, strings) was added, checked and reverted; the commit body and `rules/module-layout`'s new "What adding a feature touches" list every file it took, the ones beyond criterion 2's set included, which ticket 63 removes.
- [x] Both naming baselines are empty (criterion 14). Verified: `wc -c` of `src/tests/naming.baseline.txt` and `tauri/src/guard/naming.baseline.txt` prints 0 for both; the TypeScript guard shares the Rust guard's `UNCOUNTABLE` list (`diagnostics`, `settings`). Gate in the run's tree: check 0, eslint 0, vitest 0, build:web 0, `cargo test --lib` 647 passed; node tests fail only the date-dependent receipt test.

*Split on 2026-09-29 at integration: the throwaway kind took files beyond criterion 2's set (the kind glyphs, the per-kind refusal on both sides, the layer map, a router test pinning the five kinds); making it take only the allowed set is ticket 63.*

## Relevant areas

- `.aep/rules/`, `.aep/contexts/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
