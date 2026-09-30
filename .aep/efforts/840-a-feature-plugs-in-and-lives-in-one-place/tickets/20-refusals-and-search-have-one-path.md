---
status: resolved
blocked-by: [01]
---
# refactor(desktop): refusals and record search each have one path

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Refusal handling spread over `api/refusal.ts`, `error/refusal.ts` and `sync/refusal.ts` is one path: each feature declares its codes in its own `refusal.ts`, `api/refusal.ts` unions them, and `error/refusal.ts` alone turns a code into a sentence. Search keeps one SQL matching helper (`platform/database/search.ts`) and one caller-side module.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [x] A search finds no second refusal or search module (criterion 13). Verified: `find apps/desktop/src/lib -name '*refusal*' -o -name '*search*'` (tests aside) lists `api/refusal.ts` (the union, type imports only), `error/refusal.ts` (the only code-to-sentence module), six per-feature `refusal.ts` declarations, `platform/database/search.ts` (SQL matching and the match shape) and `layout/record-search.ts` (the caller side), plus `design/block/search-field.svelte`, a list input.
- [x] The type check that fails on a code without a sentence still fails. Verified: adding `'tenant.scratchWithoutSentence'` to `tenant/refusal.ts` made `pnpm check` print `ERROR src/lib/error/refusal.ts 47:63 Type '"tenant.scratchWithoutSentence"' is not assignable to type 'Covered'` (1 error); reverted.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test (the account-refusal test moved with only its import).

## Relevant areas

- `src/lib/api/refusal.ts`, `src/lib/error/refusal.ts`, `src/lib/sync/refusal.ts`, `src/lib/api/search.ts`, `src/lib/platform/database/search.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
