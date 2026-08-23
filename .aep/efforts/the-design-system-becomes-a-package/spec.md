---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: spec
status: accepted
---

# Problem

The shared user interface layer is inside the application that happens to use it first.

`apps/desktop/src/lib/design/` is 459 files: 56 primitive families ported from shadcn-svelte
and owned since, fifteen composite blocks, nine cells, and 26 helper modules. Every one of
them is reachable only through `$lib`, which resolves inside `@rentable/desktop` and nowhere
else. A second Rentable application — a mobile client, a website — has no way to draw a button
that is this product's button. Its only routes are to copy the tree, which forks the design at
the moment of the copy, or to re-derive it, which forks it faster.

The cost is not about effort. **It is that the design stops being one design.** `app.css`
carries a palette whose comments argue for each colour: blue exists only in `primary` and
`ring` "so it can only ever mark the active, selected, or focused element"; `money` had to be
its own green because on a directory row beside a glyph reporting a condition, "in blue it
would say *live* about a count". [[rules/interface]] fixes a tone vocabulary of five, arrived
at after finding six vocabularies of which no two agreed. A second application built beside
this one inherits none of that, and every one of those decisions gets made a second time by
whoever is building that screen.

**And the tree is not sorted for this.** `design/` holds three unlike things under one name:
components that know nothing about rents, components that know a great deal about them, and
the machinery connecting the application to its data. `cell/status.svelte` types its status
vocabulary as `keyof TranslationFunctions['common']['status']`, so it is bound to this
application's translation keys by type rather than merely by import. `query.ts` names the
workspace's own concepts. `mutation.ts` reaches `$lib/api` and `$lib/history`. Fifty-nine files
under `design/` import `$lib/i18n`, and more than thirty of those are primitives. Nothing
separates the portable layer from the rest, so the question *what would a second app take* has
no answer today short of reading all 459 files.

# Goal

The user interface every Rentable application shares is a package those applications depend on,
and the desktop application is one of its consumers rather than its owner.

A change to a primitive, a block, a tone or a colour is made once and reaches every application
drawing from it. What stays with the desktop application is what is about rents.

# Scope

- A new workspace package, `@rentable/design`, private and consumed through `workspace:*`.
- Which of the primitives, blocks and helper modules cross into it, and which stay.
- The token layer the packaged components render against: the palette, the tone vocabulary, the
  radius ladder, the shell breakpoint, and the base, scrollbar and reduced-motion rules every
  surface currently inherits from `app.css`.
- How a packaged component reaches the strings and the direction it renders, now that it cannot
  reach this application's generated locale modules.
- `components.json`, whose four aliases point the shadcn-svelte CLI at `$lib/design/*` and which
  must follow the tree.
- The desktop application's imports, its `package.json`, and the workspace and task-graph
  configuration that has to know about a third package.
- **A way to test a rendered component**, which this repository does not have. Added to scope on
  2026-08-23, on the human's direction, after the grill found that two of the acceptance
  criteria could not be checked by anything here.

# Requirements

1. `@rentable/design` exists as a package in this workspace, private, and the desktop
   application depends on it through `workspace:*` the way it already depends on
   `@rentable/workspace-permission`.
2. The package holds the primitives, the blocks that carry no domain, and the helper modules
   those two need.
3. The package imports nothing that names this application: not its generated i18n modules, not
   `platform`, not `api`, not `history`, not `error`.
4. Every human-readable string and the reading direction a packaged component renders are
   supplied by its consumer through **one typed contract the package declares and the consumer
   satisfies once at its root**. A consumer that satisfies it incompletely fails type-checking.
   No packaged component takes a chrome string as a per-call-site prop.
5. The token layer ships with the package, so two applications drawing from it cannot come to
   disagree about what a colour, a tone or a radius means. **What is global to a surface but
   not to a product stays with the application that owns it**, and each application keeps a
   stylesheet of its own for that.
6. Domain presentation stays with the desktop application: the cells, the workspace query-cache
   policy, mutation, undo, and any block that reads them.
7. The shadcn-svelte CLI still adds a new primitive, and it adds it into the package.
8. The desktop application behaves exactly as it does today. Every surface renders identically
   in both locales and both directions, and no component gains, loses or changes a treatment.
9. Every check, lint, test, format and build invocation still runs from the repository root and
   scoped to a single package, and the new package is covered by each of them.
10. A second application in this workspace can consume the package without changing it.
11. The repository's release and caching machinery knows about the package: `turbo.json` hashes
    it into the tasks whose results depend on it, and it is decided whether a change to the
    package is something a changeset is written against.
12. A rendered component can be tested. The package carries tests that render its components and
    assert what reaches the DOM, and they run in the same gate as everything else.
13. What the packaged components render is covered by those tests rather than by inspection.
    Coverage is not total, and what it must reach is the two things this move puts at risk:
    that a component renders the string it was given, and that it renders in the direction it
    was given.

# Acceptance Criteria

1. `pnpm install` from a clean checkout resolves the workspace with `packages/design` in it, and
   `apps/desktop/package.json` lists `@rentable/design` at `workspace:*`.
2. The package holds the primitive families and the blocks named under `# Scope` once, and
   `apps/desktop/src/lib/design/` holds no copy of any file that moved.
3. `grep` over the package finds no `$lib/` and no `@rentable/desktop` import specifier, and the
   package's own `check` script passes. **`$app/` is deliberately not on that list**: the
   SvelteKit constraint permits it, and a criterion that forbade it would fail a package built
   exactly as intended.
4. Deleting one key from the desktop application's contract object makes `pnpm check` fail, and
   the failure names the missing key. The type the package exports is the authority: `grep`
   finds no packaged component reading a string from anywhere else.
5. `grep` finds every colour, tone, radius and breakpoint token in one stylesheet inside the
   package, and none of them redefined in `apps/desktop/src/app.css`. That file still holds the
   desktop application's own global rules, the window scroll lock among them, and a second
   application is free to omit them.
6. `cell/`, `query.ts`, `mutation.ts`, `inverse.ts` and `undo-shortcut.ts` are still under
   `apps/desktop/src/lib/`, and `grep` finds no import of any of them from inside the package.
7. Adding a primitive not already present, through the CLI as [[references/shadcn-svelte]]
   documents it, writes into the package, and the written file compiles.
8. The component tests of criterion 12 pass, and the desktop application's thirteen routes are
   opened in Arabic once by a human, because a test that renders a component cannot tell anyone
   whether a screen still reads correctly.
9. `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:rust`, `pnpm build` and `pnpm build:web`
   pass from the root, and the per-package form runs the new package's own.
10. A throwaway second package importing `@rentable/design` renders a button, a dialog and one
    block with its own strings and passes `check`. It is deleted once it has.
11. `turbo.json`'s `test` task lists the package under `inputs`, and a commit touching only the
    package makes the desktop application's tests re-run rather than restoring a cached result.
    Whatever is decided about changesets is written into [[references/changesets]], because that
    is where the question gets asked again.
12. `pnpm test` from the root runs the package's component tests along with everything else, and
    a run on a clean checkout passes. [[rules/testing]] gains a section saying what a component
    test is, where it lives, and which runner collects it, and [[references/node-test]] or a
    reference beside it carries the invocation.
13. Deleting the `dir` the contract supplies makes a component test fail. Deleting a string the
    contract supplies makes a component test fail. Both are demonstrated, because these are the
    two failures this effort creates and neither is caught by anything today.

# Constraints

- **A file may move; what it renders may not.** The same constraint
  [[efforts/the-repository-becomes-a-monorepo/spec]] worked under, for the same reason: a
  restructure this size is reviewable only if behaviour is out of scope, because a reviewer
  reading four hundred files cannot also be judging whether each still does the right thing.

  **It is stated about what renders rather than about what a file does, because requirement 4
  is a declared exception to it** and there is exactly one. Where a component reads its strings
  from changes; what appears on screen does not. A constraint that forbade both would forbid
  the effort.
- **The string contract is one object, and it is small.** The shared layer's whole i18n surface
  is already collected under a single namespace: seventeen distinct keys across the primitives,
  thirty-six across the blocks, and every one of them under `common.*`. It is chrome — *close*,
  *loading*, *next page*, *no results* — rather than content, which is why it is one contract
  the consumer satisfies at its root and not a prop on every call site. **Threading `close`
  through several hundred call sites would be the failure mode, not the discipline**: the
  keys are identical at every use, so a per-call-site prop buys a compile error and pays for
  it with several hundred edits that a reviewer cannot distinguish from each other.

  Direction is in the same contract for the same reason and a stronger one: more than twenty
  primitives set `dir` on the element they render, and it is ambient by nature. *Written when
  the effort was planned. #779 moved ten of those families onto `contract.direction`, and #780
  the last two along with the two that read a direction for something other than the attribute;
  the figure is a reading of the tree at a moment, and the argument is what does not move.*
- **Requirement 4's last sentence binds the package, not what a consumer is allowed to pass.**
  *Decided at #780, which is where the tasks put the question, and recorded rather than fixed.*
  Two things let a call site win over the contract and both stay. Every packaged component
  spreads `{...restProps}` after the attributes it sets, so a call site passing `aria-label` or
  `dir` overrides a contract read; and `command-dialog` declares `title` and `description` as
  props whose defaults are contract reads. **The requirement exists to stop a packaged component
  rendering a string the consumer cannot translate.** A consumer that passes one does it in its
  own code, in its own language, under its own review, which is a different act from the package
  hard-coding English, and no call site in `apps/desktop` passes any of them today.

  **What closing it would cost is the argument for leaving it.** The spread ordering is uniform
  across all 56 families; inverting it in the nine that read the contract would make one half of
  the package disagree with the other, and a reader meeting that inconsistency is worse served
  than by a hole nobody occupies. A command palette's title, separately, varies by palette rather
  than being chrome, so a prop is the right shape there whatever the general rule is. If a second
  consumer ever does override a packaged label, that is the evidence this was wrong, and it
  arrives as a screen somebody can look at rather than as a rule nobody applied.
- **`design/primitive/` was generated once and is owned now**, and what the CLI's replacing
  flags would discard is load-bearing. [[rules/frontend]] records the failure exactly: the files
  left there read the i18n store for a string or for `dir`, and a regenerated file
  "carries neither and still compiles and renders, so the damage shows up as a silently English,
  silently LTR primitive rather than as an error". `add --overwrite` and `init --reinstall` are
  not how anything crosses. *This quoted the rule's count as well as its sentence, and the count
  moves every time a family crosses: it was more than thirty files when this was written, was
  seventeen after #779, and reached zero at #780, when the last seven families crossed. What the
  flags would discard now is a contract read rather than a store read, and [[rules/frontend]]
  carries the replacement count. The quotation now carries only the part that does not move.*
- **Moving a component does not release it from the rules that shaped it.**
  [[rules/interface]] and [[rules/frontend]] keep binding everything in the package: the tone
  vocabulary, the spacing subset, the motion rules and their reduced-motion gates, the bidi rule
  separating a machine's string from a reader's, and the shell breakpoint being declared once.
  Their `paths:` frontmatter follows the tree in the same change, or the rules stop loading
  where the code went.
- **Packages here are internal.** Nothing is published to a registry, and `access: "public"` in
  the changesets configuration is inspected rather than acted on.
- **Every consumer of this package is a SvelteKit application.** Directed by the human on
  2026-08-23, covering the mobile client and the website. It is a constraint rather than an
  assumption because the package is allowed to depend on it: `$app/navigation` and
  `$app/environment` may be imported, and a consumer that is not SvelteKit will not merely be
  inconvenienced, it will fail to build. **Nothing enforces this but this line**, which is why
  it is written here and not left implicit in the imports.
- **Both locales stay first-class.** Whatever replaces the direct i18n read serves Arabic and
  RTL as well as it serves English, or it has broken half the application to make a package.
- **Node `^24.0.0`, pnpm `>=11.0.0`, Svelte 5 runes, Tailwind v4 configured CSS-first.** The
  toolchain is not a thing this effort is also changing, and there is no JavaScript Tailwind
  config to hand a package.
- **A component test runner is an addition to this repository's testing story, not a
  replacement for it.** [[rules/testing]] fixes what a test is here — `node:test`,
  `node:assert/strict`, importing the `.ts` source directly, under `tsx` — and a component test
  satisfies none of that, because rendering a `.svelte` file needs a DOM and a Svelte compiler
  in the test path. So the repository ends with two runners, and the rule has to say which
  covers what or the answer becomes whichever one somebody reached for last. **Nothing already
  covered by `node:test` moves**: the existing tests are pure logic and routers, and neither
  gains anything from a DOM.

# Out of Scope

- **Building the second application.** No mobile client, no website, no admin surface is created
  here. This effort makes one possible; it does not start one.
- **Publishing to npm.** The same boundary [[efforts/the-repository-becomes-a-monorepo/spec]]
  drew, and nothing here changes it.
- **The database schema's own deferred extraction.** It has its own removal condition, in that
  effort's `# Architecture`, and it fires on a different trigger. Two extractions in one change
  is one reviewable change fewer.
- **Redesigning anything.** No colour is chosen, no spacing adjusted, no component reshaped. A
  palette that changes file keeps every value it had.
- **The cells.** `money`, `date`, `phone`, `status`, `fulfillment`, `count`, `ring` and
  `status-count` are this application's domain wearing a design system's clothes, and they stay.
- **The workspace query cache, mutation, undo and the inverse.** These are the application's
  connection to its own data.
- **The application shell.** `layout` is not part of the design system and was deliberately kept
  out of it (#257); it is not being moved into a package now.
- **Regenerating any existing primitive through the CLI**, for the reason under
  `# Constraints`.
- **Rust, Tauri, and the control plane.** Nothing in `tauri/` or `apps/control-plane/` is
  touched.
- **A component gallery.** Somewhere to browse the package's components is a reasonable next
  thing to want, and it is not this change.

# Assumptions

- **A second user interface application is coming inside this workspace.** Stated by the human
  on 2026-08-23, naming a mobile application and a website. Nothing in the repository shows one:
  `apps/control-plane` is a headless Fastify service with no Svelte, no Tailwind and no UI. This
  is the load-bearing assumption of the whole effort, and it is the one
  [[efforts/the-repository-becomes-a-monorepo/spec]] refused to make about the schema. See
  `# Risks`.
- ~~**Those applications are Svelte.**~~ **Promoted to a constraint on 2026-08-23**, and
  strengthened: they are SvelteKit. It stopped being an assumption when the package was allowed
  to depend on it.
- ~~**Tailwind v4 tokens can be shipped from a package**~~ **Confirmed 2026-08-23 at #776**, and
  it is no longer an assumption. `packages/design/src/lib/tokens.css` is imported by
  `apps/desktop/src/app.css` and the emitted stylesheet is the same rule set it was before the
  move. `@theme static` came with it and `--breakpoint-shell` is still emitted in `:root`.

  Two things the assumption did not anticipate, both silent. **Import order is part of the
  contract**: the package import must follow `@import 'tailwindcss'`, or the packaged
  `@layer base` stops being ordered above preflight and every default border turns opaque white,
  with a successful build. And the `@source` line is the other one, as this spec's `# Interfaces`
  already said. The token file's own header now states all three lines.

  One clause of the moved comment is **unproved rather than wrong**: it says `static` is what
  stops `--breakpoint-shell` being eliminated "because it is referenced from script rather than
  from a utility". Removing `static` at #776 produced a byte-identical bundle, because the
  desktop's own `shell:` utilities reference the breakpoint today. The insurance is cheap and
  correct in principle; the claim that it is load-bearing here is not demonstrated. The comment
  was left unedited because criterion 1 required every comment to move unchanged.
- **`components.json` can point the shadcn-svelte CLI into a workspace package.** Unverified.
  [[rules/frontend]] says all four alias keys route different kinds of generated file and every
  one must be repointed when the directory moves; it does not say whether the target may leave
  the package the config sits in.
- **Svelte components can be exported as source**, the way `@rentable/workspace-permission`
  exports raw `.ts`, with no `svelte-package` build step. Unverified.

# Open Questions

- **Where exactly the line falls for two blocks and two helper modules.** Reading their imports,
  the fifteen blocks sort into three groups. Six are already clean and could move as they are:
  `field-error`, `page-frame`, `record-action-control`, `specification`, `standalone-surface`,
  `surface-action`. Seven are clean but for the i18n read, which requirement 4 now answers:
  `back-control`, `delete-dialog`, `export-dialog`, `form-surface`, `record-card`,
  `record-surface`, `selection-dialog`. **Two reach further, and they are the question.**
  `list.svelte`, at 918 lines, pulls `$lib/error/message`, `$lib/error/toast` and
  `$lib/platform/tauri`; `record-actions` pulls `design/mutation` and `$lib/platform/clipboard`.
  Two helper modules beneath them are in the same position: `filter.ts` imports
  `$lib/api/period`, and `csv.ts` imports `$lib/platform/tauri`. Whether each is inverted,
  split, or left behind is [[skills/plan]]'s.

  *`record-surface` was in this group until 2026-08-23. `$app/navigation` was its only reach
  beyond i18n, and the SvelteKit constraint took it out of the question.*

  **One edge runs the wrong way across that grouping, found while deriving the tasks.**
  `record-card.svelte` imports `recordCard` from `list.svelte` — a module-scope class list at
  `list.svelte:18`, not a component. So a block in the clean group depends on one of the two
  open ones, and either `record-card` waits for `list.svelte` to be resolved or `recordCard`
  moves out from under it first. Whichever is chosen is a task-ordering matter and not a change
  to this grouping.
*Two questions were open when this spec was drafted and are answered here rather than deleted,
so the reasoning is not re-derived. The i18n seam is the other, and it became requirement 4.*

- ~~**Whether the package may import `$app/*` at all.**~~ **It may.** Answered 2026-08-23: every
  Rentable client is SvelteKit, the mobile application and the website included. So
  `record-surface` moves as it stands, `back.svelte.ts` and `create-intent.ts` travel with it,
  and navigation is not something a consumer supplies. **What this buys is paid for in a
  constraint rather than free** — see `# Constraints`.
- **What form the token layer takes** — one stylesheet the consumer imports, a Tailwind v4 theme
  file, or something else. *Which rules stay behind is no longer open: requirement 5 and
  acceptance criterion 5 settled that on 2026-08-23, when the window scroll lock turned out to
  be sitting in the same file as the palette.*
- **Whether a change to the package is something a changeset is written against.** The
  machinery makes this consequential rather than clerical. `.changeset/config.json` sets
  `privatePackages: {version: true, tag: true}` and `updateInternalDependencies: "patch"`, and
  [[references/changesets]] records what a tag does here: it "is what triggers the signed Tauri
  artifact build". So versioning the package patch-bumps `@rentable/desktop` and cuts a
  four-platform desktop release. The three candidate answers are that the package is versioned
  in its own right, that it is treated as `@rentable/control-plane` is and never gets one, or
  that a design change gets its changeset written against the applications it reaches. Left
  open rather than guessed, because it changes what shipping looks like.
- **Whether `shell:` survives as a name** now that the shell is per application. Two things read
  that number today, the stylesheet and `is-below-shell-breakpoint.svelte.ts`, and the whole
  point of declaring it once is that they cannot disagree.
- **Whether the package exports source or a built artifact**, and what that costs the desktop
  application's Vite build and its `svelte-check` run.

# Risks

- **The i18n inversion fails silently by construction.** [[rules/frontend]] already names it: a
  primitive that loses its translation read still compiles and renders. A mechanical pass across
  thirty-plus primitives and twelve blocks is thirty-plus chances to produce a component that
  looks correct in English on the machine doing the work and is broken in Arabic. **Four things
  are aimed at it, in the order they would fire.** *It said three until #777 built the second of
  them.* Requirement 4's typed contract makes a missing key a type error, so it never reaches a
  screen. The reader throws where no provider was rendered at all, which is the case the type
  cannot see. Criterion 13's component tests catch a component that has the string and renders it
  wrong, or renders in the wrong direction. Criterion 8's Arabic pass catches what none of the
  three sees, which is a screen that is correct component by component and wrong as a whole. **The residue is real**: a component that quietly
  stops rendering a string it was given, in a locale nobody opened, on a screen no test drives.
- **The boundary is being drawn before its second consumer exists.**
  [[efforts/the-repository-becomes-a-monorepo/spec]] made this exact argument against extracting
  the schema — "all of the cost of a boundary, none of the substitutability", and worse, "a
  guess at the wrong boundary" — and deferred it behind a removal condition. That reasoning is
  overruled here deliberately, on the human's direction of 2026-08-23, on the ground that a
  shared design is the thing being bought rather than a shared module. **How it would show up:**
  the first real consumer arrives, finds the package split in the wrong place, and spends its
  first week reshaping a package instead of building screens. Acceptance criterion 10's
  throwaway consumer is the cheapest available proxy for that, and it is a proxy rather than
  proof.
- **Two test runners is a seam that closes badly.** The repository has run on `node:test` alone
  and [[rules/testing]] is written as though that is the only kind of test there is. A second
  runner arriving inside an effort that is mostly a file move is the classic way a testing
  story fragments: the rule gets one section written in a hurry, and six months later half the
  new tests are in the wrong runner because nobody could tell which was meant. Acceptance
  criterion 12 puts the rule change in the same change deliberately, and it is the part most
  likely to be skipped under time pressure.
- **A four-hundred-file diff makes review shallow exactly where a mistake is cheapest to make.**
  The same risk the monorepo restructure carried, with the same mitigation: behaviour is out of
  scope, so a reviewer is checking that things moved rather than that they changed.
- **The palette and the components can be separated by accident.** A token moving while
  something that reads it stays behind produces a colour resolving to nothing, and an unresolved
  custom property renders as an inherited or transparent value rather than as an error.
  `is-below-shell-breakpoint.svelte.ts` reading `--breakpoint-shell` is the known instance;
  there may be others.

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
> [[efforts/the-design-system-becomes-a-package/evidence/research/what-a-package-may-use-for-its-own-imports]]

**The package uses subpath imports — `#lib/...` — declared in its own `imports` field.**
Measured rather than argued:
[[efforts/the-design-system-becomes-a-package/evidence/prototypes/a-source-exported-package-without-lib]]
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
| `design/block/` — the six clean blocks | `packages/design/src/lib/block/` — `field-error`, `page-frame`, `record-action-control`, `specification`, `standalone-surface`, `surface-action`, moved as they stand |
| `design/block/` — the seven i18n-only blocks | same destination, after requirement 4's inversion — `back-control`, `delete-dialog`, `export-dialog`, `form-surface`, `record-card`, `record-surface`, `selection-dialog` |
| `design/block/list.svelte`, `design/block/record-actions.svelte` | **open** — see `# Open Questions`; the two that reach past i18n |
| `design/{tailwind,tone,group,selection,shortcut,sort,identifier,money,is-below-shell-breakpoint}.ts` | `packages/design/src/lib/` — the nine root modules that already import nothing outside `design/` |
| `design/{back,confirmation,list-keyboard,shortcut-registry}.*` | `packages/design/src/lib/` — `back` and `confirmation` reach only `$app/*`, `design/*`, or i18n types, all three of which the package may now have. **`shortcut-registry.svelte.ts` does not**, and this row said it did until #780: it reaches `$lib/platform/diagnostics`, which requirement 3 forbids, so it and `list-keyboard` wait for the seam ticket. *Found while moving `sidebar` past it, which registered a keyboard shortcut from its own state. What that forces is a rule rather than a fact about this row, and [[rules/frontend]] holds it.* |
| `design/{csv,filter,date,import,create-intent}.ts` | **open** for the first two; `date.ts` and `import.ts` stay, being locale formatting and database search; `create-intent.ts` moves with `$app/types` |
| `design/cell/**`, `design/{query,mutation,inverse,undo-shortcut}.*` | stay in `apps/desktop/src/lib/design/` — the domain, per requirement 6 |
| `app.css`'s `:root`, `@theme`, `@theme static`, `@layer base`, scrollbar and reduced-motion blocks | `packages/design/src/lib/tokens.css` |
| `app.css`'s window scroll lock | stays in `apps/desktop/src/app.css`, per requirement 5 |
| `apps/desktop/components.json` | `packages/design/components.json`, with `ui` repointed at `$lib/primitive` and `components` at `$lib/block` |
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
([[efforts/the-design-system-becomes-a-package/evidence/research/packaging-a-svelte-design-system]],
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
6. **Resolve the two open modules** — `list.svelte` and `record-actions` — under whatever
   `# Open Questions` settles.
7. **Move `components.json` and prove requirement 7**, by adding a primitive not already present
   through the CLI with `--cwd packages/design`.
8. **Delete what was left behind**, and take `apps/desktop/src/lib/design/` down to the domain.

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
