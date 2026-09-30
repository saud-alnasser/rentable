---
status: resolved
blocked-by: [35]
---
# refactor(desktop): every other feature and capability carries its own strings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The rest of each locale file moves the same way; `i18n/{en,ar}/index.ts` hold only the imports, the shared vocabulary (`common.actions`, `labels`, `nav` and the like) and the composed object.

## Acceptance Criteria

Traces requirement 8 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 8.

- [x] A test holds each locale index to imports, shared vocabulary and the composed object (criterion 8). Verified: `i18n/tests/composition.test.ts` parses each locale index with the TypeScript API and allows only type imports, same-locale piece imports, the composed object and `export default`, with strings only under the listed shared paths; it passes in the run's tree, and the child ran it red against HEAD's `en/index.ts` (`common.export.description: a string written in the index`).
- [x] `i18n-types.ts` regenerates identical. Verified: after integration, `pnpm exec typesafe-i18n --no-watch` leaves `i18n-types.ts` unchanged and the file is byte-identical to HEAD (`git diff --cached --quiet HEAD` passes); the child's esbuild serialisation of HEAD's and the new composed `en` and `ar` came out identical, ordered and sorted.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/i18n/en/index.ts`, `src/lib/i18n/ar/index.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
