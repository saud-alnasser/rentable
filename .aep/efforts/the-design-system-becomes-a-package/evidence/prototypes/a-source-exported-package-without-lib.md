---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: prototype
---

# Hypothesis

A workspace package that exports Svelte source, using self-reference or `#`-subpath imports
instead of `$lib` for its own internal imports, can be consumed by the desktop application:
Vite bundles it, `svelte-check` type-checks across the boundary, the package's own check runs
without the package being a SvelteKit project, and the shadcn-svelte CLI can still write into it.

Built because
[[efforts/the-design-system-becomes-a-package/evidence/research/what-a-package-may-use-for-its-own-imports]]
falsified the premise the accepted architecture rested on, and left four questions that only a
build could answer.

# Falsifier

Any one of these refutes it:

- Vite fails to resolve a self-reference or a `#lib` specifier from inside the package.
- `svelte-check` in the consumer cannot see through the `svelte` export condition — **including
  the case where it reports no errors because it typed the import as `any`**, which is why the
  experiment includes a deliberate type violation rather than only a clean run.
- `svelte-check` cannot run at all on a package that is not a SvelteKit project.
- The shadcn CLI cannot be pointed at the package.

# Experiment

A worktree at `.aep/worktrees/alias-probe`, detached at `116c3444`. In it, `packages/design/`
was created as a non-SvelteKit package: a `svelte.config.js` carrying only `vitePreprocess()`,
a `tsconfig.json`, a `tailwind.ts` holding `cn`, and two probe components importing it two
different ways — one by self-reference (`@rentable/design/tailwind`), one by subpath import
(`#lib/tailwind.ts`). `apps/desktop` took it as a `workspace:*` dependency and imported both
from a route.

Seven measurements were run. The `@source` measurements use a **named** utility, `caret-lime-400`
in the package against `caret-pink-500` in the desktop as a control, after an earlier attempt
using an arbitrary-value utility produced a false negative for everything including the control.

# Observation

| # | Measurement | Result |
| --- | --- | --- |
| 1 | `svelte-check` on a non-Kit package | **runs.** 82 files, 0 errors |
| 2 | self-reference `@rentable/design/tailwind` from inside the package | resolves, in both `svelte-check` and Vite |
| 3 | subpath import `#lib/tailwind.ts` from inside the package | resolves, in both |
| 4 | types crossing the boundary, raw source, no build, no `.d.ts` | **they cross.** `<ProbeSelf label={42} />` produced `ERROR "src\routes\probe-page.svelte" 6:12 "Type 'number' is not assignable to type 'string'."` |
| 5 | Vite bundling the package's components | bundled into `_app/immutable/nodes/2.*.js` |
| 6 | Tailwind scanning the package with no `@source` | **does not.** `caret-lime-400` absent from every emitted stylesheet while the desktop's own `caret-pink-500` was present |
| 7 | Tailwind with `@source` | **generated.** All four path forms worked |

Measurement 7 in full, each run against a clean `build/`:

```
../node_modules/@rentable/design                 GENERATED
../node_modules/@rentable/design/**/*.svelte     GENERATED
../../../packages/design/src                     GENERATED
../../../packages/design/src/**/*.svelte         GENERATED
```

**The CLI took three attempts and each failure named its own cause**, which is what made it
worth running rather than reasoning about:

1. `CLI Error: Missing paths field in your tsconfig.json for path aliases.` So the CLI resolves
   through **tsconfig `paths`**, not through `svelte.config.js` alone as the documentation's
   phrasing suggests.
2. `CLI Error: This CLI requires Tailwind CSS and Svelte to be installed.` The package has to
   carry `tailwindcss` and `svelte` itself.
3. With `paths` mapping `#lib/*` and `components.json` aliases written as `#lib/...`:
   `badge installed at src\lib\primitive\badge`.

And the part that decides the design — **the generated file wrote the alias itself**:

```svelte
import { cn, type WithElementRef } from "#lib/tailwind.js";
```

Two smaller observations, both surprises:

- `baseUrl` alongside `paths` raises `Option 'baseUrl' is deprecated and will stop functioning in
  TypeScript 7.0`. Removing it and keeping `paths` alone works, and the CLI still accepts it.
- `#lib/tailwind.js` resolved to `./src/lib/tailwind.ts`, so the repository's existing habit of
  writing `.js` on a TypeScript import survives the move unchanged.

Final state: package check 82 files 0 errors, desktop check 9661 files 0 errors, `build:web` ok.

# Result

**Confirmed**, against every clause of the falsifier. Measurement 4 is the one that carries it:
a clean run alone would not have distinguished a working boundary from an `any`.

One finding contradicts the earlier research rather than extending it: that research concluded
from the documentation that the `node_modules` `@source` form was the documented one and left the
pnpm-symlink case under *Not checked*. All four forms work, and the difference is not the path.

# Conclusion

The accepted architecture survives with `$lib` replaced by **subpath imports**, and subpath
imports beat self-reference on one measurement rather than on taste: **the CLI writes `#lib/`
specifiers into generated files by itself**, so a newly added primitive compiles as written and
needs no import fixing. Self-reference would have needed every generated import rewritten by hand.

The configuration that produced the passing run:

```jsonc
// packages/design/package.json
"imports": { "#lib/*": "./src/lib/*" },
"exports": { "./<subpath>": { "svelte": "...", "types": "...", "default": "..." } }

// packages/design/tsconfig.json — paths, and no baseUrl
"paths": { "#lib": ["./src/lib"], "#lib/*": ["./src/lib/*"] }

// packages/design/components.json
"aliases": { "ui": "#lib/primitive", "components": "#lib/block",
             "utils": "#lib/tailwind", "hooks": "#lib" }

// apps/desktop/src/app.css
@source '../../../packages/design/src';
```

The package also needs `tailwindcss` and `svelte` as its own devDependencies for the CLI, and
`clsx` and `tailwind-merge` as real dependencies — `svelte-check` caught the last two as
undeclared, which is the package's check earning its place on its first run.

This is findings, not a decision. What the spec adopts is decided in `# Architecture`.

# Disposition of the code

**Deleted.** The worktree `.aep/worktrees/alias-probe` was removed. Nothing from it is promoted;
the configuration above is a record of what was measured, and what ships is written fresh under
`[[modes/implement]]` against #774's acceptance criteria.

# Not checked

- **Only the desktop consumed it.** A second consumer, which is what acceptance criterion 10
  exists for, was not built.
- **No component was rendered in a browser.** The build succeeded and the bundle contains the
  components; nothing confirmed they paint.
- **`svelte-package` was not tried**, so approach C stays as the plan described it rather than as
  something measured against A.
- **One probe component, two imports.** Nothing here exercised a component importing another
  component across a subdirectory, which is what the primitives actually do.
- **`eslint` was not run against the package.** `eslint.config.js` imports
  `apps/desktop/svelte.config.js` and hands it to every `*.svelte` file in the repository, which
  is now the wrong config for the package's files. Unmeasured, and it belongs to #774.
