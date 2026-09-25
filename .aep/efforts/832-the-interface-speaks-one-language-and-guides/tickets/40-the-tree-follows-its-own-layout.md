---
status: resolved
blocked-by: [38, 39]
---

# refactor(desktop): the tree follows its own layout rules

## Outcome

The unit concept has one home. A fixture several modules share lives where the testing rule puts
shared scaffolding, and no module keeps a copy. The package's font directory is singular and ships
only what consumers need. Each package's lint tests scan their own tree through one shared scanner.
New comments carry no em dash. The frontend rule lists what stays in the application as it now is.
Found by review round 1 (standards findings 1, 2, 5, 6, 7, 8 and 9).

## Acceptance Criteria

Traces requirement 6 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 6.

- [x] Unit's acts, host store and host component live in one place under `[[rules/module-layout]]`
      (all under `complex/unit/`, or all behind the `unit-` prefix), imports updated. Verified: all of unit (acts, host store, `name.ts`, components, tests) lives under `complex/unit/`, as module-layout prefers a directory; `pnpm check` 0 errors and desktop node 1192 of 1192, vitest 385 of 385 on the merged tree.
- [x] `query-providers.svelte` sits where `[[rules/testing]]` puts scaffolding shared across
      modules, and `tenant/tests/providers.svelte`'s copy is replaced by it. Verified: the fixture is `apps/desktop/src/tests/query-providers.svelte`, reached as `#tests/*`; the tenant copy is deleted; the testing and module-layout rules say where shared scaffolding lives.
- [x] `packages/design/src/lib/fonts/` is `font/` (or a declared exception, as `tests/` is), and
      its README, licence and patch script are not reachable through the package's `exports`. Verified: `packages/design/src/lib/font/`, with `exports` mapping `./font/*` to null so README, OFL and the patch script resolve as not exported while `tokens.css` still loads them; root `pnpm build:web` emits both fonts.
- [x] `apps/desktop/src/lib/design/tests/motion.test.ts` scans only the application; the package
      holds its own motion lint. The duplicated source scanner is one helper per package. Verified: each package has one `src/tests/source.ts` scanner used by its lint tests; the package holds its own motion scan and the desktop one scans only the app; design node 158 of 158, vitest 115 of 115.
- [x] The em dashes at `design/block/list.svelte` and `block/record-surface.svelte` are gone. Verified: the two cited em dashes are gone; the only em dash the effort adds to source is a date test's regex that detects dashes.
- [x] `[[rules/frontend]]` lists `create-control`, `list-toolbar` and `search-field` among what
      stays in the application and says why, reconciled with `[[rules/interface]]` *Create*.
 Verified: `rules/frontend.md` lists `create-control`, `list-toolbar` and `search-field` among what stays in the application and why, matching *Create* in `rules/interface.md`.
## Relevant areas

- `apps/desktop/src/lib/complex/`, `organization/tests/query-providers.svelte`,
  `tenant/tests/providers.svelte`, `packages/design/src/lib/fonts/`, `packages/design/package.json`,
  the lint tests in both packages, `.aep/rules/frontend.md`
