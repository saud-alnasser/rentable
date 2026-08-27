---

---

# Question

Can a package that exports Svelte source use `$lib` for its own internal imports, and if not,
what may it use instead?

Asked at the first step of building #774, because the chosen architecture rests on the answer:
the spec's *Architecture* says `$lib` resolving inside the package is what lets the shadcn CLI
write into it and what makes the import rewrite one substitution.

# Sources

- SvelteKit documentation, *Packaging*, <https://svelte.dev/docs/kit/packaging>. Read 2026-08-23.
  Primary.
- Node.js documentation, *Modules: Packages*, <https://nodejs.org/api/packages.html>. Read
  2026-08-23. Primary.
- Repository inspection: `apps/desktop/svelte.config.js`, `apps/desktop/vite.config.js`,
  `eslint.config.js`, `packages/workspace-permission/package.json`. Read 2026-08-23 at
  `e21b2ed`.

# Findings

**1. An alias in a library is processed by `svelte-package`, and by nothing else.**

  source — "Ensure that you add aliases via `svelte.config.js` (not `vite.config.js` or
  `tsconfig.json`), so that they are processed by `svelte-package`."

  interpretation — the reason the instruction exists is that the alias has to be **rewritten
  before the source leaves the package**. `svelte-package` is named as the thing that does the
  rewriting, and the page names nothing else.

  conclusion — **a package that exports raw source cannot use `$lib` internally.** The specifier
  reaches the consumer unrewritten, and the consumer's bundler resolves `$lib` to the consumer's
  own library directory. It does not fail to resolve; it resolves to the wrong file, which is the
  worse outcome.

**2. `$lib` is SvelteKit's, and a package that is not a SvelteKit project does not have one.**

  observation — `$lib` comes from SvelteKit's `files.lib` and is supplied by the Kit Vite plugin
  and the generated `.svelte-kit/tsconfig.json`. `apps/desktop/svelte.config.js` declares no
  `kit.alias` at all, so every `$lib` in this repository today is that default and nothing else.

  interpretation — a `svelte.config.js` carrying only `vitePreprocess()` supplies no `$lib`.
  Making the package a real SvelteKit project would supply one for **type-checking inside the
  package** and would not change finding 1 for consumers.

**3. SvelteKit's own guidance is to avoid `$app/*` in a package.**

  source — "You should avoid using SvelteKit-specific modules like `$app/environment` in your
  packages unless you intend for them to only be consumable by other SvelteKit projects." It
  suggests `esm-env` and passing contextual data as props instead.

  interpretation — this does not contradict the spec's SvelteKit constraint, which chose exactly
  the intent the sentence names. It is recorded because it is the documentation flagging the cost
  the constraint accepts, and because a later reader will meet it.

**4. Two documented mechanisms let a package name its own files without an alias.**

  source — self-reference: "Within a package, the values defined in the package's `package.json`
  `exports` field can be referenced via the package's name", and it is "only available if
  `package.json` has `exports`". Importing something the `exports` field does not expose fails.

  source — subpath imports: there is "a package `imports` field to create private mappings that
  only apply to import specifiers from within the package itself", and "entries in the `imports`
  field must always start with `#`".

  conclusion — a packaged component may import a sibling as `@rentable/design/primitive/button`
  (self-reference, limited to what `exports` exposes) or as `#lib/primitive/button` (subpath
  imports, private and unrestricted). Both are resolved relative to the package containing the
  importing file, which is the property `$lib` lacks.

# Conclusion

**The premise under the chosen architecture is false as stated.** A source-exporting package
cannot use `$lib` internally, because nothing rewrites the specifier on the way out and the
consumer resolves it to its own tree.

What survives is the shape of the finding rather than the choice: `$lib` was carrying two
different jobs in the plan, and only one of them is in trouble.

- **Internal imports** have two documented replacements, self-reference and subpath imports, and
  either keeps the rewrite mechanical: `$lib/design/` becomes `@rentable/design/` or `#lib/`,
  which is still one substitution.
- **The shadcn CLI's alias** is the job that is genuinely harder, because the CLI writes files
  whose contents contain `$lib/...` specifiers. Whatever the package uses internally, a generated
  file needs its imports adjusted before it compiles.

That is a design choice with more than one reasonable answer, so it is not made here.

# Not checked

- **Nothing was executed.** No package was created, no self-reference was resolved, and no
  consumer imported one. Findings 1 and 4 are documentation.
- **Whether Vite and `svelte-check` resolve self-reference and `#`-imports** the way Node
  documents them. Node's resolution algorithm is what bundlers implement, and both are widely
  supported, but neither was tried here against `vite ^8.2.2` or `svelte-check ^4.7.6`.
- **Whether `svelte-package` would in fact rewrite `$lib` correctly** for this package. Finding 1
  is read from an instruction about how to make it work, not from a demonstration that it does.
- **What the shadcn CLI writes** when its `ui` alias is not a `$lib` path. It was not run.
- **Whether `svelte-check` can type-check a package that is not a SvelteKit project**, which was
  the question #774 was cut to answer and which this stopped before reaching.
