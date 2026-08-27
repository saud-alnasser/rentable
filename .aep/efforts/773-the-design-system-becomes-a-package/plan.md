---
use-when: "building a ticket in this effort and the approach to packaging the design system is not obvious from the spec"
---

# Architecture

**Chosen: the package is a SvelteKit library project that exports its source.** Option A below,
agreed 2026-08-23.

`packages/design/` is laid out the way SvelteKit's own packaging expects — a `svelte.config.js`,
a `src/lib/` tree — and its `package.json` `exports` point at that source through a `svelte`
export condition. **There is no build step.** Consumers compile it, exactly as they already
compile `@rentable/workspace-permission`, whose `tsconfig.json` states the idiom in its own
words: "The package has no build. `exports` points both conditions at `index.ts`, and every
consumer compiles it."

**Amended 2026-08-23, after the first acceptance criterion of the first ticket falsified the
premise this rested on.** The shape is unchanged; what the package uses for its own imports is
not.

> ~~`$lib` resolves inside the package.~~ **It cannot.** SvelteKit's packaging documentation
> says aliases are declared in `svelte.config.js` "so that they are processed by
> `svelte-package`" — the alias has to be rewritten *before the source leaves the package*, and
> with no build step nothing rewrites it. A `$lib/tailwind.js` specifier reaches the consumer
> unrewritten and resolves against the **consumer's** library directory. It does not fail; it
> resolves to the wrong file.
> [[efforts/773-the-design-system-becomes-a-package/evidence/research/what-a-package-may-use-for-its-own-imports]]

**The package uses subpath imports — `#lib/...` — declared in its own `imports` field.**
Measured rather than argued:
[[efforts/773-the-design-system-becomes-a-package/evidence/prototypes/a-source-exported-package-without-lib]]
built the package, consumed it from the desktop, and ran seven measurements. All four clauses of
the falsifier came back negative.

Three things follow from that shape, and each of them is why it was chosen over the
alternatives:

- **The shadcn-svelte CLI writes into it, and writes the alias itself.** This is the finding that
  chose subpath imports over self-reference. The CLI resolves aliases through **tsconfig
  `paths`** rather than through `svelte.config.js` alone, and given `paths` mapping `#lib/*` and
  `components.json` aliases written as `#lib/...`, a generated `badge.svelte` arrived carrying
  `import { cn, type WithElementRef } from "#lib/tailwind.js";` — compiling as written, with no
  import to fix. **Self-reference would have needed every generated import rewritten by hand**,
  which is the cost that sank approach B.

  *The CLI writes a bare `#lib/tailwind.js` and that one carries an extension, so it is unaffected
  by the normalisation above. What it writes for a component import is #783's to check.*
- **The import rewrite is a substitution and a normalisation, not a redesign.** Today's internal
  specifiers are `$lib/design/tailwind.js` and its 267 siblings. Inside the package the same
  specifier becomes `#lib/tailwind.js`. Note the `.js` survives: `#lib/tailwind.js` resolved to
  `./src/lib/tailwind.ts` in the prototype, so the repository's existing habit needs no
  adjustment. *This bullet said "one substitution" until 2026-08-23, and #774 measured that a
  specifier carrying no extension resolves through neither `imports` nor `exports`. The second
  edit is mechanical and it is counted in `# Migration`.*
- **Nothing goes stale.** A `dist/` that a consumer resolves while the source beside it has moved
  on is a failure with no error attached to it, and this repository has deliberately avoided
  carrying one.

**Types cross the boundary from raw source, with no build and no `.d.ts`.** The prototype proved
it by violation rather than by a clean run: passing `label={42}` to a packaged component whose
prop is a `string` produced `Type 'number' is not assignable to type 'string'` from the
consumer's `svelte-check`. A run with no errors would not have distinguished a working boundary
from one typed as `any`.

## The alternatives, and why they lost

Produced under conflicting constraints, per [[skills/plan/design-it-twice]].

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **A — SvelteKit library project, source exports, no build** *(match the repository's own idiom)* | The CLI keeps working through `--cwd`; the import rewrite is one mechanical substitution; no build to run, cache, or invalidate; identical in shape to the two packages already here | The package carries a `svelte.config.js` and a SvelteKit dependency it uses for almost nothing but `$lib` and the CLI's alias resolution | `svelte-check` across the boundary is unverified (research, *Not checked*); if it cannot see through the `svelte` condition, the package needs `.d.ts` after all | Lowest — one tree, one source of truth, and the tooling already documented here keeps working |
| **B — plain package, relative imports, no SvelteKit** *(minimise dependencies)* | Nothing but Svelte and the component source; the smallest possible package manifest; no framework in a package that draws buttons | Every internal import in ~400 files is rewritten by hand from `$lib/...` to a relative path; the shadcn CLI has nowhere to resolve an alias, so adding a primitive becomes a manual copy | Requirement 7 is not met, and the workaround for it is undocumented on both sides | Highest — a hand-maintained generation step is the thing that stops being done |
| **C — SvelteKit library project plus `svelte-package`** *(the conventional publishing shape)* | Real generated `.d.ts`; the documented path SvelteKit describes; a consumer resolves built output and never compiles the package | A build step in the graph, an output to cache and invalidate, and a `dist/` that can disagree with its source | A stale `dist/` fails silently: the consumer renders the previous version of a component with no error | Higher — one more thing to run, and the failure it introduces has no symptom until somebody notices the wrong pixels |

**C loses to A on the repository rather than on merit.** It is the right shape for a package
published to a registry and read by strangers, and this one is neither. When the boundary in
`# Out of Scope` changes and something is published, C is what it becomes.

**B loses on requirement 7.** It is otherwise the leaner package, and it would be the answer if
the primitives were hand-written rather than generated.

**The 2026-08-23 amendment was checked against this table rather than assumed past it.** Losing
`$lib` cost A its stated first advantage, which was most of why it beat B, so the comparison was
re-run rather than patched. A still wins, and on the same ground: subpath imports keep the CLI
working *and* keep the rewrite mechanical, which is exactly what `$lib` was there for. B's
disadvantages are unchanged and C's build step is still a build step. **What did change is the
margin** — A won on measurement this time instead of on reasoning, and the row that used to say
`svelte-check` across the boundary was unverified no longer does.

## Three decisions inside the chosen shape

**The string contract is Svelte context, keyed and typed.** The package exports a provider
component and a typed contract; the consumer renders the provider once at its root and
components read through `getContext`. Rejected: a module-level `$state` singleton the consumer
writes at startup. It reads more simply at first and it is global mutable state that no test can
isolate — two component tests running in one process would share it, which is exactly the
surface requirement 12 is buying.

**The token layer is one stylesheet in the package, imported by each consumer, and each consumer
adds one `@source` line.** The second half is not optional and is the finding most likely to be
skipped: Tailwind v4 excludes `node_modules` from class detection, so **every class inside the
package generates no utility until the consumer registers it** (research, findings 1 and 2). The
failure is unstyled components, not a build error. Rejected: a Tailwind plugin, which buys
nothing here because the tokens are `@theme` entries rather than generated utilities.

**The test runner is Vitest with jsdom and `@testing-library/svelte`**, which is what Svelte's
own documentation recommends (research, finding 6), configured with
`resolve.conditions: ['browser']` under `VITEST`. It runs in the package. `node:test` keeps
everything it covers today and gains nothing; [[rules/testing]] gains a section saying which
runner collects what, per acceptance criterion 12.

# Components

| Component | Becomes |
| --- | --- |
| `design/primitive/**` | `packages/design/src/lib/primitive/**` — 56 families, unchanged but for the i18n inversion and the `$lib/design/` to `#lib/` specifier substitution. *Complete at #780. `spinner` crossed early with the contract at #777, #778 took the 38 that render no string, #779 the ten that read a locale for nothing but a direction, and #780 the last seven.* |
| `design/block/` — the six clean blocks | `packages/design/src/lib/block/` — `field-error`, `page-frame`, `record-action-control`, `specification`, `standalone-surface`, `surface-action`, moved as they stand. *Complete at #781, unchanged but for the specifier substitution.* |
| `design/block/` — the seven i18n-only blocks | same destination, after requirement 4's inversion. **Five of the seven, at #781**: `back-control`, `delete-dialog`, `form-surface`, `record-surface`, `selection-dialog`. *`export-dialog` and `record-card` are not among them, and this row said they were until #781. Both were classified by reading their own imports, and both reach past the design system through one file that was not read with them: `export-dialog` imports `design/csv`, which imported `$lib/platform/tauri`, and `record-card` imported `recordCard` from `list.svelte`. Neither is a change to the grouping's argument, and both crossed at #782 once the module each waited on was placed, adding six keys to `DesignStrings` and taking it from 28 to 34.* |
| `design/block/list.svelte`, `design/block/record-actions.svelte` | **both stay in `apps/desktop/src/lib/design/block/`.** Settled at #782; `# Open Questions` holds the rule and the reasoning. `list.svelte` registers three keyboard shortcuts, which [[rules/frontend]] forbids a packaged component outright, and it narrows through `design/filter`; `record-actions` reaches `design/mutation`, which is out of scope by name. *The two that were waiting on them no longer are: `record-card` crossed once `recordCard` moved onto it, and `export-dialog` once `csv.ts` crossed.* *#784 asked the follow-on question these two and the three modules in the row below raise together — whether five files that are neither packageable nor obviously domain want a home of their own — and settled it as no. They stay under `design/`, which is where the machinery a concept reaches for has always lived here; a sixth top-level home for five files is a restructure, and #784's first constraint is that nothing new is built in it.* |
| `design/{tailwind,tone,group,selection,shortcut,sort,identifier,money,is-below-shell-breakpoint}.ts` | `packages/design/src/lib/` — the nine root modules that already import nothing outside `design/` |
| `design/{back,confirmation,list-keyboard,shortcut-registry}.*` | `packages/design/src/lib/` — `back` and `confirmation` reach only `$app/*`, `design/*`, or i18n types, all three of which the package may now have. **`shortcut-registry.svelte.ts` does not**, and this row said it did until #780: it reaches `$lib/platform/diagnostics`, which requirement 3 forbids. *#782 settled it by leaving all three of `shortcut-registry.{ts,svelte.ts}` and `list-keyboard.ts` with the application, and the ground is not the diagnostics reach: a registration describes itself out of `TranslationFunctions`, and nothing in the package holds a registry or wants one. So `back` and `confirmation` are what this row moves.* *Found while moving `sidebar` past it, which registered a keyboard shortcut from its own state. What that forces is a rule rather than a fact about this row, and [[rules/frontend]] holds it.* |
| `design/{csv,filter,date,import,create-intent}.ts` | **settled at #782 for the first two.** `csv.ts` moves, declaring the two wire types it builds rather than importing them and taking an `ExportWriter` from its consumer; `filter.ts` stays, being domain. `date.ts` and `import.ts` stay, being locale formatting and database search; `create-intent.ts` moves with `$app/types` |
| `design/cell/**`, `design/{query,mutation,inverse,undo-shortcut}.*` | stay in `apps/desktop/src/lib/design/` — the domain, per requirement 6 |
| `design/provider/sonner.svelte` | **stays**, and no ticket named it until #784. It is not domain and it is not shared: it renders the packaged `Toaster` with `duration={1500}`, which is this application's choice about its own toasts, and `+layout.svelte` is its only consumer. A packaged component that fixed the duration would be deciding it for every consumer, so what belongs in the package is the `Toaster` and what belongs here is the number. |
| `app.css`'s `:root`, `@theme`, `@theme static`, `@layer base`, scrollbar and reduced-motion blocks | `packages/design/src/lib/tokens.css` |
| `app.css`'s window scroll lock | stays in `apps/desktop/src/app.css`, per requirement 5 |
| `apps/desktop/components.json` | `packages/design/components.json`, with `ui` repointed at `#lib/primitive` and `components` at `#lib/block`. *This row said `$lib` until #783, and it was written before the amendment above replaced `$lib` with subpath imports throughout. `$lib` resolves nothing inside the package, and the CLI rejects it: all five aliases are `#lib/...`, `lib` among them.* |
| `apps/desktop/src/lib/design/tests/` | splits: what covers a moved module moves with it, and the rest stays |

**`tailwind.ts` crossed early, at #777 rather than with the rest of its row.** `spinner` is the
first component to move and `cn` is the one helper it cannot render without, so the helper had to
be in the package before it was. What stayed behind is a one-line re-export at
`apps/desktop/src/lib/design/tailwind.ts`, which keeps every specifier still pointing at it
valid, and #778 deletes it in the same substitution that rewrites them. *The alternative was
rewriting those specifiers here instead, which would have edited the same lines twice: once to
`@rentable/design/tailwind.js` and again to `#lib/tailwind.js` when the files holding them moved
into the package.*

**There are 279 of those sites under `apps/desktop/src`, not 268, and ten of them carry no
extension.** Counted at #777. The figure repeated until then came from #778's body, which says
something narrower and correct: 268 occurrences of `tailwind.js` *alone*. The ten written
`$lib/design/tailwind` are exactly what the normalisation above exists for, and a prefix
substitution leaves them behind. `components.json` names the same module once more, through
its `utils` alias, and that one is repointed rather than rewritten.

# Interfaces

The package's public surface is four things.

*It said three until 2026-08-23, and the count was wrong rather than the list incomplete: the
library-root modules were described as implementation while the desktop already imported them.
Of the modules `# Components` moves into the package, fourteen have importers outside
`design/` today, across 75 call sites, `sort` at 11 and `selection` at 10. They are public
whatever the manifest says, which is why the wildcard below exposes them rather than the
wildcard being the thing that made them public.*

- **The components**, reached as `@rentable/design/primitive/<family>/index.js` and
  `@rentable/design/block/<name>.svelte`, through an `exports` subpath carrying `svelte`,
  `types` and `default` conditions. A per-family subpath rather than one barrel, because a
  single entry point makes every consumer's bundle depend on every component in the package.
- **The contract**, `@rentable/design/strings.js` — the provider component and the type a
  consumer must satisfy. Requirement 4's compile-time failure is this type, and ~~nothing
  else~~ **a throw beneath it**, corrected at #777: a consumer that renders no provider at all
  type-checks perfectly, because the object is only checked where a provider is rendered, so the
  reader throws rather than falling back.

  *Built at #777. It exports `DesignProvider`, `DesignStrings`, `DesignDirection`,
  `DesignContract` and `useDesignContract`; the direction is in it as well as the words, because
  the constraint above puts them in one contract. **The provider writes two getters rather than
  the props themselves**, and that is not a style choice: `setContext` runs once, during the
  provider's own initialisation, so a plain object written there would freeze the words a
  consumer started with and a language switch would never reach a packaged component. Measured
  both ways, and it is the one thing in the package that no gate would have caught.*
- **The stylesheet**, `@rentable/design/tokens.css`, plus the `@source` line each consumer writes.
- **The library-root modules**, reached as `@rentable/design/<name>.js` — class merging, tone,
  sorting, selection, and the rest of what `# Components` moves to `src/lib/`. Not a designed
  surface so much as an acknowledged one.

**The `@source` line is part of the interface even though it is not code.** A consumer that
imports the stylesheet and omits it gets a silently unstyled application, so it belongs in what a
caller must understand to use this module, which is what [[skills/plan/depth]] means by an
interface.

**Measured 2026-08-23**, with a named utility in the package against a control in the desktop:
with no `@source`, the package's class was absent from every emitted stylesheet while the
desktop's own was present. With it, both appeared. **All four candidate path forms worked** —
`../node_modules/@rentable/design`, that path with a `**/*.svelte` glob, `../../../packages/design/src`,
and that path with a glob — so the pnpm symlink is not the obstacle the earlier research left
open under *Not checked*.

`#lib/...` is **internal and not part of this interface.** It is declared in the package's own
`imports` field, which resolves only for specifiers inside the package, so no consumer ever
writes one. That is the property `$lib` lacked.

**The subpath map is one wildcard**, `"./*"` onto `"./src/lib/*"`, carrying the three
conditions. Written while building #774, and rewritten there twice because the first two shapes
were measured and failed.

**What a wildcard cannot do is add an extension**, and that is what decides the map. A pattern
takes one `*` and substitutes it literally, so `@rentable/design/tailwind` resolves to
`./src/lib/tailwind`, which is not a file. Measured at the desktop's own type gate:

```
Cannot find module '@rentable/design/primitive/button' or its corresponding type declarations.
Cannot find module '@rentable/design/back.svelte' or its corresponding type declarations.
Cannot find module '@rentable/design/tailwind' or its corresponding type declarations.
```

A per-family pattern does not rescue it and makes things worse:
`"./primitive/*"` onto `"./src/lib/primitive/*/index.ts"` resolves the bare family name, and
turns `primitive/button/index.js` into `.../button/index.js/index.ts`. **The two forms need
opposite rules**, which is why the map collapsed to one pattern instead of three.

So **the consumer's specifier names a file, with its extension**, and the map is the identity on
`src/lib/`. All four shapes were measured through it, by violation rather than by a clean run:

```svelte
import PageFrame from '@rentable/design/block/page-frame.svelte';
import { useBack } from '@rentable/design/back.svelte.js';      // a rune module
import { Button } from '@rentable/design/primitive/button/index.js';
import { cn } from '@rentable/design/tailwind.js';
```

Passing a number to each `string` prop and parameter produced four
`Type 'number' is not assignable to type 'string'` errors, and both components reached the
bundle. `.js` still resolves onto `.ts`, so the repository's existing habit survives here exactly
as it does inside the package.

**This costs the migration a normalisation pass, and `# Migration` carries it.** It is the one
claim this section previously got wrong: the rewrite is not only a prefix substitution.

**The `svelte` condition is kept and is currently inert**, which is the opposite of what #774's
third criterion asserts. All three conditions point at the same target, so deleting `svelte`
entirely changes nothing: the desktop still type-checks and still bundles. It earns its place
only if a condition ever diverges from `default`, which is what would happen if a `dist/` ever
appeared. Keeping it is cheap and forward-safe; **recording it as verified would have been
false**, and the research that called it required
([[efforts/773-the-design-system-becomes-a-package/evidence/research/packaging-a-svelte-design-system]],
finding 3) was read against a package that resolves `.svelte` through it rather than through a
`default` pointing at the same file.

# Technical Approach

Sequenced so that each step is separately reviewable and the tree compiles at the end of each.

1. **Create the package empty and wire the graph.** `packages/design/` with its manifest,
   `svelte.config.js`, `tsconfig.json`, and a Vitest configuration. `turbo.json` gains it under
   the `test` task's `inputs`, per requirement 11. Nothing has moved yet, so nothing can break.

   **What the package actually needs was measured, not guessed** — the prototype found each of
   these by hitting the error that names it:

   | It needs | Because |
   | --- | --- |
   | `imports: { "#lib/*": "./src/lib/*" }` | the internal alias, resolved only inside the package |
   | `paths` in `tsconfig.json`, and **no `baseUrl`** | the CLI refuses without `paths`; `baseUrl` beside it raises a TypeScript 7 deprecation, and `paths` alone works |
   | `tailwindcss` and `svelte` as its own devDependencies | `CLI Error: This CLI requires Tailwind CSS and Svelte to be installed` |
   | `clsx` and `tailwind-merge` as real dependencies | `svelte-check` caught both as undeclared on the package's first run |
   | `exports` subpaths carrying `svelte`, `types` and `default` | how a consumer resolves a component, and how its types cross |
2. **Stand up the test runner and prove it**, against one trivial component written for the
   purpose. This is first rather than last because criterion 13's failures cannot be
   demonstrated by a runner that arrives at the end.

   *Corrected 2026-08-23 at #775: this step read "and deleted after", and that cannot be done.
   Acceptance criterion 12 wants `pnpm test` from the root to run the package's component tests
   on a clean checkout, and deleting the only subject leaves `vitest run` with no files at all
   between here and the first real component three tickets later. Measured: with the only test
   file moved away, `vitest run` exits 1 with `No test files found`, and so does the turbo task.
   So the fixture stays, under `src/tests/`, outside the library directory the export map
   publishes. Whether it is worth keeping past the point where real components exist is
   **judgement rather than measurement**, and the argument is that a runner whose only subjects
   are the components under active development reports each of its own faults as a fault in
   whatever was being edited at the time.*
3. **Move the token layer.** `tokens.css` into the package, the `@source` and the import into
   `apps/desktop/src/app.css`. Verified by the application still rendering, which is the step
   where an unregistered `@source` announces itself.
4. **Move the primitives in three passes, split by the kind of edit each needs** rather than by
   family. *Corrected 2026-08-23 while deriving the tasks: this step read "family by family",
   and [[rules/version-control]] makes one ticket one branch one commit, so family by family
   would be 56 tickets.* Splitting by edit is what actually makes the diff reviewable, because
   each pass is one rule a reviewer can check and then spot-check against:

   | Pass | Families | Files | The edit |
   | --- | --- | --- | --- |
   | the string-free families | 38 | 195 | `git mv` plus one specifier substitution, and nothing else |
   | the direction-only families | 10 | 105 | the same, plus `dir` read from the contract rather than from `localesMetadata[$locale]` |
   | the string-rendering families | 8 | 87 | the same, plus each `$LL.common.*` read replaced by hand |

   `spinner` is one of the eight and crosses early, in step 3's successor, as the worked example
   the other seven are built against.

   *The file counts were estimates until each pass ran. Measured: #778 moved 195 files, #779 105,
   and #780 85. Of those 85, seventeen read the contract at all: sixteen for a string, three for a
   direction, and two of those in both sets. They needed sixteen keys, which with `loading` from
   `spinner` at #777 is the seventeen `DesignStrings` holds.*
5. **Move the blocks**, the six clean ones first, then the seven that need the contract.

   *Measured at #781, which moved eleven of the fifteen. The six clean ones cost a specifier
   substitution and nothing else. The five that needed the contract added eleven keys to
   `DesignStrings`, taking it from seventeen to 28, and reused `close` and `previous`, which the
   primitives had already put there. The thirty-six figure above counted every `$LL` read in all
   fifteen blocks rather than the distinct keys the movable ones needed; the eleven are what
   crossing actually cost. One of the eleven is a function rather than a string, which
   [[rules/frontend]] carries as a rule.*
6. **Resolve the two open modules** — `list.svelte` and `record-actions` — under whatever
   `# Open Questions` settles.

   *Done at #782, and what it settled is that neither crosses. Three modules did instead:
   `csv.ts` with an injected writer, and `export-dialog` and `record-card` behind it once the
   two edges holding them were cut. `# Open Questions` has the rule and the reasoning; the
   consequence for step 8 is that `design/` comes down to the domain **plus** the list and what
   holds its keys, rather than to the domain alone.*
7. **Move `components.json` and prove requirement 7**, by adding a primitive not already present
   through the CLI with `--cwd packages/design`.
8. **Delete what was left behind**, and take `apps/desktop/src/lib/design/` down to the domain.

   *Done at #784, and there was nothing left behind to delete.* Each moving ticket used `git mv`
   and rewrote its own specifiers, so the tree was already at 34 files when this step opened, down
   from 459. What this step turned out to be is **verification, plus the one edit no moving ticket
   could make**.

   **The check that a moved file is gone has to be content over the whole application, not paths
   under `design/`.** Comparing relative paths between `packages/design/src/lib/` and
   `apps/desktop/src/lib/design/` is the obvious form and it is too weak: a copy left at
   `apps/desktop/src/lib/layout/component/record-card.svelte` passes it and violates the criterion,
   which says *gone from the application* rather than gone from one directory. What was run instead
   is a content hash of every file under `packages/design/src` against every file under
   `apps/desktop/src`, which finds zero identical pairs. *Raised at #784's own review; the weaker
   sentence was what this paragraph said first.*

   **The edit is the manifest.** Ten of the desktop's devDependencies had no import site left
   anywhere in that application: `@tanstack/table-core`, `bits-ui`, `clsx`,
   `embla-carousel-svelte`, `formsnap`, `layerchart`, `mode-watcher`, `paneforge`,
   `tailwind-merge` and `vaul-svelte`. Every one is a dependency of something that crossed, and
   every one is declared by `packages/design/package.json`. Eight are a primitive family's;
   `clsx` and `tailwind-merge` are `tailwind.ts`'s, which is a helper rather than a family and
   crossed first, at #777, because it is what `spinner` could not render without. #784's own notes
   expected nine; `bits-ui` is the tenth, and it reads as used only because three components
   mention it in a comment. **This could not be done family by family**: a manifest edit per crossing is nine
   chances to remove something a route still imports, and the set is only closed once
   `primitive/` is gone.

   *Four more devDependencies have no import site and are **not** removed here:
   `@fontsource/fira-mono`, `@neoconfetti/svelte`, `@tailwindcss/forms` and
   `@tailwindcss/typography`. `git log -S` over the whole history finds each in the root manifest
   at the initial commit and in #506's move, and in no source file ever. They are SvelteKit
   template residue rather than anything this effort made dead, so removing them here would put an
   unrelated change in a diff whose reviewability is the constraint the whole effort runs under.*

# Migration

There is no data migration. What migrates is import specifiers, in two mechanical
substitutions, one mechanical normalisation, and one manual pass:

- Inside the package: `$lib/design/` becomes `#lib/`. 268 occurrences of `tailwind.js` alone.
- In `apps/desktop`: `$lib/design/<moved>` becomes `@rentable/design/<moved>`.
- **Normalisation: every specifier crossing the package boundary names a file, with its
  extension.** `# Interfaces` has why, measured. This one was missed until #774 and is the
  reason the prefix substitution above is not the whole of the rewrite.
- Manual: the i18n inversion, which is the only edit in this effort that changes what a file
  does rather than where it sits.

**The manual pass is the one that needs a reviewer**, and separating it from the two
substitutions is what makes that possible.

## What the normalisation actually touches

Counted at `9c7647f9` over `apps/desktop/src`, excluding `design/`'s own files:

| Form today | Becomes | Sites |
| --- | --- | --- |
| `primitive/<family>` | `primitive/<family>/index.js` | 139 |
| a root module with no extension, `selection`, `sort`, `csv` | the same name with `.js` | about 100 |
| a rune module written `<name>.svelte` | `<name>.svelte.js` | 19 |
| `primitive/<family>/index.js`, `<name>.js` | unchanged | 270 plus 37 |

**Nothing about this fails quietly.** Every un-normalised specifier is `Cannot find module` at
the type gate, so a ticket that half-does it cannot land green. That is the property that makes
it safe to spread across the moving tickets rather than doing it in one.

*Why it lands on the moving tickets rather than becoming its own: those tickets already rewrite
the prefix on every one of these lines, so normalising is a second edit to a line being edited,
not a second pass over the tree.*

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1, 2, 6 | `pnpm install` on a clean checkout, and `grep` over the two trees |
| 3 | `grep` for `$lib/` and `@rentable/desktop` in the package, and the package's `check` script |
| 4 | deleting a key from the desktop's contract object and running `pnpm check` |
| 5 | `grep` over both stylesheets, plus the application rendering |
| 7 | one CLI run with `--cwd packages/design` |
| 8 | the component tests, plus one human pass over the thirteen routes in Arabic |
| 9 | the six root invocations, on a clean checkout |
| 10 | the throwaway consumer package, then deleted |
| 11 | a commit touching only the package, and observing the desktop's tests re-run rather than restore from cache |
| 12, 13 | the component tests themselves, and the two deliberate deletions |

**Which existing tests move**: everything under `design/tests/` covering a module that moves goes
with it and keeps running under `node:test`, because those are pure logic and gain nothing from a
DOM. `[[skills/plan/depth]]`'s rule against layering does not fire here: no test is being replaced
by a test at a different level, they are being relocated.

**The Arabic pass ran at #784, over all thirteen routes**, and what it found is recorded at
[[efforts/773-the-design-system-becomes-a-package/evidence/research/the-arabic-pass-over-the-thirteen-routes]]
rather than here, because a pass is a discovery and this section says what checks a criterion.
Two faults surfaced, #804 and #805, and both predate the effort.

*What the pass cannot establish is the half of requirement 8 that needs a before.* It can say every
surface is whole and reads correctly, which is what it says. It cannot say a spacing value is the
one it was in June, because nothing was recorded to compare against. What carries that instead is
the token layer moving in one piece at #776, and the risk that move actually ran was the unstyled
component, which the pass does rule out.

# Operational Considerations

**Nothing about the running application changes.** No new process, no new network call, no new
file on disk. The package is a compile-time boundary and disappears entirely into the bundle.

The one operational question is release, and it is open — see `# Open Questions` on changesets.
Until it is answered, the safe default is that a design change is described by a changeset
against `@rentable/desktop`, because that is the package a user can observe, which is the test
[[references/changesets]] already applies to `@rentable/control-plane`.

# Technical Risks

- **The `@source` line is one line, and forgetting it costs a day.** Tailwind generates no
  utility for a class it never saw, so the application renders with correct markup and no styling
  and nothing reports an error. Step 3 of `# Technical Approach` is placed early specifically so
  this fires while the change is still small enough to attribute. **Confirmed by measurement on
  2026-08-23** rather than inferred from documentation, and the remedy confirmed with it.
- ~~**`svelte-check` across the boundary is unverified.**~~ **Retired 2026-08-23.** It was
  measured, by violation rather than by a clean run: a wrong prop type across the boundary
  produced `Type 'number' is not assignable to type 'string'`. Approach A needs no `.d.ts`.
- ~~**The shadcn CLI writing into a package addressed by `--cwd` is untried as a whole.**~~
  **Retired 2026-08-23.** It was tried, it works, and the two things it demanded on the way are
  now in step 1's table. It also writes the internal alias itself, which is what chose subpath
  imports over self-reference.
- **The repository's ESLint configuration hands every `.svelte` file the desktop's
  `svelte.config.js`.** `eslint.config.js` imports it by path and passes it as `svelteConfig` for
  `**/*.svelte`, which after this effort is the wrong config for several hundred files that live
  in a different package with a config of its own. Unmeasured — the prototype never ran ESLint —
  and it belongs to the first ticket. **How it would show up**: parser errors on package files,
  or worse, no errors and a rule silently not applying.
- **Two test runners in one repository.** Already named under `# Risks`; the technical half is
  that Vitest and `node:test` will both collect a file named `*.test.ts` if their globs are
  allowed to overlap, and the package is the only place Vitest looks.
