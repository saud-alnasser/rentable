---
status: resolved
blocked-by: [38, 39]
---
# refactor(desktop): the remaining oversized files are split

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every source file under `src/lib` still over 500 lines is split along its concerns: at least `complex/router.ts`, `complex/query.ts`, `payment/router.ts`, `workspace/router.ts`, `settings/component/area.svelte`.

## Acceptance Criteria

Traces requirement 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 17.

- [x] No non-generated source file under `src/lib` passes 500 lines, or it is named in [[rules/module-layout]] with why (criterion 17). Verified: `find src/lib` over non-test `.ts` and `.svelte` files, the generated `i18n/i18n-types.ts` aside, finds none over 500 lines; the largest is `organization/member/component/host.svelte` at 498. `complex/router.ts` 865 to 408 (with `complex/unit/router.ts` 479), `complex/query.ts` 515 to 268, `payment/router.ts` 675 to 449, `mutation/mutation.ts` 615 to 412, `transfer/transfer.ts` 599 to 391; nothing is named in `rules/module-layout`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, build:web 0, validate 0; node tests fail only the date-dependent receipt test that fails at the tip without this ticket, and since that failure stops the desktop script before vitest, vitest was run on its own: `80 passed (80)`, `623 passed (623)`; the design package's vitest `114 passed`. Tests moved with their subject; the child's `assert`/`test(` counts match before and after (201 complex, 158 payment).

## Relevant areas

- `src/lib/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
