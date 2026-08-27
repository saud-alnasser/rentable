---

---

# Question

Can a Tailwind v4 + Svelte 5 design system be extracted into a pnpm workspace package that a
SvelteKit application consumes, without a build step, and can the shadcn-svelte CLI still write
new primitives into it?

Three sub-questions, each of which the spec carried as an unverified assumption: whether Tailwind
v4 generates utilities for classes written inside a linked workspace package, whether
`vite-plugin-svelte` compiles `.svelte` files that arrive from a dependency, and whether the
shadcn-svelte CLI can target a package other than the application it is run from.

# Sources

- Tailwind CSS documentation, *Detecting classes in source files*,
  <https://tailwindcss.com/docs/detecting-classes-in-source-files>. Read 2026-08-23. Primary.
- `sveltejs/vite-plugin-svelte`, `docs/faq.md` on `main`,
  <https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md>. Read 2026-08-23.
  Primary, and the project's own documentation rather than a release note.
- SvelteKit documentation, *Packaging*, <https://svelte.dev/docs/kit/packaging>. Read
  2026-08-23. Primary.
- shadcn-svelte documentation, *components.json* and *CLI*,
  <https://www.shadcn-svelte.com/docs/components-json> and
  <https://www.shadcn-svelte.com/docs/cli>. Read 2026-08-23. Primary.
- Svelte documentation, *Testing*, <https://svelte.dev/docs/svelte/testing>. Read 2026-08-23.
  Primary.
- Repository inspection: `apps/desktop/svelte.config.js`, `apps/desktop/tsconfig.json`,
  `apps/desktop/vite.config.js`, `apps/desktop/components.json`,
  `packages/workspace-permission/{package.json,tsconfig.json}`. Read 2026-08-23 at `e21b2ed`.

# Findings

**1. Tailwind v4 does not scan a linked workspace package, and the failure is silent.**

  source — "Tailwind will scan every file in your project for class names, except in the
  following cases: Files that are in your `.gitignore` file; Files in the `node_modules`
  directory; Binary files...; CSS files; Common package manager lock files."

  interpretation — a pnpm workspace package is reached through `node_modules/@rentable/design`,
  which is a symlink into `packages/design`. Either way the path a consumer resolves runs through
  `node_modules`, which is excluded.

  conclusion — every class written inside the package generates no utility unless the package is
  registered explicitly. **The symptom is unstyled components rather than an error**, which is
  what makes this worth establishing before the design rather than during it.

**2. `@source` is the documented remedy, and it is written in the consumer's stylesheet.**

  source — "Use `@source` to explicitly register source paths relative to the stylesheet... This
  is especially useful when you need to scan an external library that is built with Tailwind,
  since dependencies are usually listed in your `.gitignore` file and ignored by Tailwind by
  default." The example given is `@source "../node_modules/@acmecorp/ui-lib";`.

  conclusion — each consuming application carries one `@source` line naming the package. It is
  per consumer, not per package, so a second application that omits it renders unstyled.

**3. `vite-plugin-svelte` compiles `.svelte` from a dependency, but only through the `svelte`
export condition.**

  source — "Using the `svelte` field in `package.json` to point at `.svelte` source files is
  **deprecated** and you must use a `svelte` export condition."

  source — libraries without the condition: "resolving the library is going to fail" in a future
  version; version 3 still falls back to the deprecated field.

  conclusion — a source-exported component package is supported and is the documented shape. The
  package's `exports` needs a `svelte` condition beside `types` and `default`. Pre-bundling may
  need `optimizeDeps.exclude`, which the FAQ raises as a performance matter rather than a
  correctness one.

**4. `svelte-package` is recommended for publishing and is not established as required.**

  source — the packaging page describes `svelte-package` processing `src/lib` into `dist` with
  components preprocessed and `.d.ts` generated.

  observation — the page does not address consuming raw `.svelte` from a workspace package
  without it. **This is a gap in the source rather than a negative answer**, and finding 3 is
  what makes the no-build shape supportable on evidence rather than on silence.

  observation — this repository already runs the no-build shape for TypeScript.
  `packages/workspace-permission/tsconfig.json` states it in its own comment: "The package has no
  build. `exports` points both conditions at `index.ts`, and every consumer compiles it."

**5. The shadcn-svelte CLI resolves aliases through SvelteKit, and has no documented monorepo
support.**

  source — "The CLI uses these values and the `alias` config from your `svelte.config.js` file to
  place generated components in the correct location. Path aliases have to be set up in your
  `svelte.config.js` file."

  source — `add` and `init` both accept `-c, --cwd <path>`, "the working directory (default: the
  current directory)".

  observation — the documentation names five alias keys (`lib`, `utils`, `components`, `ui`,
  `hooks`) and **says nothing about whether an alias may point outside the project**, nor
  anything about monorepos. Searching surfaced open bug reports against the upstream React CLI
  describing workspace aliases resolving to the wrong directory; those are a sibling project and
  are recorded here as a hazard rather than as a finding about this one.

  observation — `apps/desktop/svelte.config.js` declares **no `kit.alias` at all**. Every alias
  in `components.json` today is a `$lib/...` path, resolved by SvelteKit's default `files.lib`.

  conclusion — the supported way to make the CLI write into the package is for the package to be
  a project the CLI can resolve `$lib` inside, with its own `components.json`, addressed by
  `--cwd`. Pointing an alias from the application outward into another package is undocumented on
  both sides and is the shape the upstream bug reports describe.

**6. Vitest is the recommended component test runner, and effects need explicit handling.**

  source — "If you're using Vite (including via SvelteKit), we recommend using Vitest." For
  components the docs point at `@testing-library/svelte` over the `mount` API, which they call
  "somewhat brittle".

  source — `environment: 'jsdom'`; `resolve: process.env.VITEST ? { conditions: ['browser'] } :
  undefined`; code using `$effect` must be wrapped in `$effect.root()`, and `flushSync()` runs
  pending effects synchronously.

  conclusion — the runner is Vitest with jsdom. The `conditions: ['browser']` line is not
  optional decoration: without it Vitest resolves server entry points of the packages under test.

# Conclusion

All three of the spec's toolchain assumptions hold, with one correction and one hazard.

The correction is Tailwind: shipping tokens from a package is fine, but **the classes inside the
package are invisible to Tailwind until each consumer registers it with `@source`**, and the
failure mode is silent unstyled output rather than a build error.

The hazard is the shadcn CLI: it resolves aliases through a SvelteKit project's own
configuration, so the package has to look like one from the CLI's point of view. Nothing supports
aiming an application's aliases at a sibling package.

A no-build package exporting source through a `svelte` export condition is supported by
`vite-plugin-svelte` and matches the idiom this repository already documents for
`@rentable/workspace-permission`.

# Not checked

- **Nothing was executed.** Every finding is documentation and repository inspection; no package
  was created, no build was run, and no component was imported across a package boundary. The
  Tailwind `@source` behaviour in particular is documented rather than observed here.
- **Whether `svelte-check` type-checks across the package boundary** with a source-exported
  `svelte` condition, and what `apps/desktop`'s generated `.svelte-kit/tsconfig.json` does with a
  workspace dependency. Unresolved, and it decides whether the package needs `.d.ts` at all.
- **Whether the shadcn CLI actually writes correctly into a SvelteKit library project addressed
  by `--cwd`.** The mechanism is documented; this specific combination was not tried.
- ~~**The exact `@source` path** that works for a pnpm symlink.~~ **Answered twice.** The
  prototype found all four candidate forms work, including the two pointing at `packages/design`
  rather than at `node_modules`, so the difference is not the path. #776 then shipped the
  workspace-relative form for real, `@source '../../../packages/design/src'` from
  `apps/desktop/src/app.css`, and proved it by violation: with the line, a packaged
  `caret-lime-400` is emitted; without it the class is absent while the consumer's own classes
  survive. That is the form in the tree.
- Versions: findings 1 to 6 are read against current documentation on 2026-08-23 and were not
  pinned to the versions in this repository's lockfile (`tailwindcss ^4.3.3`,
  `@sveltejs/vite-plugin-svelte ^7.3.0`, `vite ^8.2.2`).
