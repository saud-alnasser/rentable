---
status: implemented
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
- `components.json`, whose aliases point the shadcn-svelte CLI at `$lib/design/*` and which must
  follow the tree. *This said "four aliases" until #783, which found a fifth. The CLI defaults
  `lib` to `$lib` and then refuses its own default, because nothing in the package maps `$lib`;
  all five are `#lib/...` now.*
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
- ~~**`components.json` can point the shadcn-svelte CLI into a workspace package.** Unverified.~~
  **Verified 2026-08-23 at #783.** `pnpm dlx shadcn-svelte@latest add alert --cwd packages/design -y`
  wrote `alert` into `packages/design/src/lib/primitive/`, and the package's `svelte-check` passed
  with it there. The target never leaves the package the config sits in: every alias is an internal
  `#lib/...`. What the assumption did not anticipate is that there are **five** alias keys rather
  than four — the CLI defaults `lib` to `$lib` and then refuses its own default, because nothing
  in the package maps `$lib`. [[rules/frontend]] and [[references/shadcn-svelte]] carry both.
- **Svelte components can be exported as source**, the way `@rentable/workspace-permission`
  exports raw `.ts`, with no `svelte-package` build step. Unverified.

# Open Questions

- ~~**Where exactly the line falls for two blocks and two helper modules.**~~ **Answered at #782,
  with the code open, which is what that ticket was for.** Reading their imports, the fifteen
  blocks sorted into three groups: six already clean, seven clean but for the i18n read, and two
  that reached further. `list.svelte`, at 918 lines, pulled `$lib/error/message`,
  `$lib/error/toast` and `$lib/platform/tauri`; `record-actions` pulled `design/mutation` and
  `$lib/platform/clipboard`. Two helper modules beneath them were in the same position:
  `filter.ts` imports `$lib/api/period`, and `csv.ts` imported `$lib/platform/tauri`.

  **The rule, and it is two rules in a fixed order.** The second is the one the ticket proposed;
  the first is what the repository already said and had to be applied before it.

  > **What [[rules/frontend]] forbids a packaged component from doing is settled first**, because
  > no injection makes it permissible. Then: a coupling to a **capability** is inverted and the
  > module moves; a coupling to a **domain concept** stays, and the module stays with it.

  A capability is something any application would have in some form: saving a file, reading the
  clipboard, showing a toast. A domain concept is something only this application has: a contract
  period, a mutation, an undo.

  | Module | Reaches | Placed |
  | --- | --- | --- |
  | `csv.ts` | `platform/tauri`, for two types | **moves**, taking an `ExportWriter` |
  | `export-dialog.svelte` | `design/csv` | **moves**, onto the contract for five strings |
  | `record-card.svelte` | `recordCard`, from `list.svelte:18` | **moves**, and the class list moves onto it |
  | `list.svelte` | `error/*`, `platform/tauri`, `design/filter` | **stays** |
  | `list-keyboard.ts` | `design/shortcut-registry` | **stays** |
  | `shortcut-registry.ts` | `i18n-types` | **stays** |
  | `shortcut-registry.svelte.ts` | `platform/diagnostics` | **stays** |
  | `filter.ts` | `api/period` | **stays** |
  | `record-actions.svelte` | `design/mutation`, `platform/clipboard` | **stays** |

  **The first rule is what decided `list.svelte`, and it decided it before any of its inversions
  were priced.** [[rules/frontend]], under its own heading, holds that *a packaged component
  registers no keyboard shortcut of its own*, because a registration describes itself out of
  `TranslationFunctions` and the package cannot reach that dictionary. `list.svelte` registers
  three, through `toListShortcuts`, and each of them names a key under `common.table`. So the
  block was never packageable on the terms the rest of the package is packageable on, and the
  four modules beneath and beside it follow it for the same reason: `list-keyboard.ts` is what
  *builds* those registrations, and `shortcut-registry.{ts,svelte.ts}` is what holds them.

  **This is why the registry did not cross, and the Components table said it would.** Nothing in
  the package needs it: `shortcut.ts` says in its own header that *the registry that holds them is
  `shortcut-registry.ts`; nothing here knows it exists*, and `primitive/sidebar` states its key
  and lets its consumer register it, which is where that rule came from at #780. Every other
  caller is under `layout/`, which is out of scope by name.

  **`filter.ts` is domain and its type does not generalise cheaply.** `PERIOD_FILTER` reads
  `FILTER_PERIODS`, and a filter labels itself with `(translations: TranslationFunctions) =>
  string` so that it can be declared once as a module constant and still render in the active
  locale. Generalising means the label becomes a resolved `string`, which turns `RANK_FILTER` in
  `contract/rank-filter.ts` from a constant into a function of the translations and moves five
  call sites with it. That is a change to a contract-domain module bought to make a block
  packageable that the rule above had already refused, so it was not made.

  **`record-actions` is the mixed case and it stays.** The clipboard is a capability and
  `design/mutation` is not: it reaches `$lib/api` and `$lib/history` and is out of scope by name.
  A split that put one of its two controls in the package would leave a seam through a
  sixty-line component to move one button.

  **What moved instead is smaller than the ticket's own table expected, and that is the answer
  rather than a shortfall.** Requirement 2 says the package holds the blocks that carry no
  domain, and it does not oblige the package to hold a list that narrows by a rent period and
  answers three keys out of this application's dictionary.

  **Both stragglers were freed, which is what the two edges below were waiting for.**
  `recordCard` moved out from under `list.svelte` and onto `block/record-card.svelte`, the
  component that wears it, so the edge now runs from the list into the package instead of the
  other way; and `csv.ts` crossing took `export-dialog` with it.

  *`record-surface` was in the i18n-only group until 2026-08-23. `$app/navigation` was its only
  reach beyond i18n, and the SvelteKit constraint took it out of the question.*

  *The edge at `list.svelte:18`, found while deriving the tasks, and the second one found at
  #781 where `export-dialog.svelte` imports `EXPORT_FORMATS` from `design/csv`, are both closed
  by the placements above.*
*Two questions were open when this spec was drafted and are answered here rather than deleted,
so the reasoning is not re-derived. The i18n seam is the other, and it became requirement 4.*

- ~~**Whether the package may import `$app/*` at all.**~~ **It may.** Answered 2026-08-23: every
  Rentable client is SvelteKit, the mobile application and the website included. So
  `record-surface` moves as it stands, `back.svelte.ts` and `create-intent.ts` travel with it,
  and navigation is not something a consumer supplies. **What this buys is paid for in a
  constraint rather than free** — see `# Constraints`.
- ~~**What form the token layer takes**~~ **One stylesheet the consumer imports, and it takes
  three lines rather than one.** Answered at #776. `packages/design/src/lib/tokens.css` holds
  `@theme`, `@layer base` and `@apply`, so a consumer writes `@import 'tailwindcss'` first,
  `@import '@rentable/design/tokens.css'` after it, and an `@source` naming this package's `src`.
  Two of the three fail silently when wrong, which is why the file's own header states all of
  them. *Which rules stay behind was settled on 2026-08-23, when the window scroll lock turned
  out to be sitting in the same file as the palette.*
- ~~**Whether a change to the package is something a changeset is written against.**~~ **It is
  not, and the change it describes is.** Answered by the human on 2026-08-27, on the three
  candidates put to them at #773: a design change a user can observe gets its changeset written
  against each application that ships it, which today is `@rentable/desktop` alone, and no
  changeset ever names `@rentable/design`. Written into [[references/changesets]] beside the
  paragraph about the control plane, which is where the question gets asked again.

  **One premise this question was built on was wrong, and the answer is not.** `tag: true` in
  `privatePackages` would not give the package a tag: `release.yml` passes
  `push-git-tags: false`, and the tag is cut by `.github/changeset-tag.cjs`, which reads
  `apps/desktop/package.json` by path and can produce no other name. What survives the correction
  is the consequence that made the question consequential — `updateInternalDependencies: "patch"`
  patch-bumps `@rentable/desktop` off a design bump, the desktop's own version moves, and its tag
  and four-platform artifact build follow from that. [[references/changesets]] carries the
  correction.
- ~~**Whether `shell:` survives as a name**~~ **It does, and both of its readers are now inside
  the package.** `tokens.css` declares `--breakpoint-shell` once, and
  `is-below-shell-breakpoint.svelte.ts` reads that same custom property at runtime rather than
  restating the number, so the two cannot disagree. The name is the product's rather than one
  window's, which is what let it cross with the palette.
- ~~**Whether the package exports source or a built artifact**~~ **Source, and there is no build
  step at all.** Answered at #774: `exports` points every condition at `./src/lib/*`, and each
  consumer compiles it — Vite bundles it and `svelte-check` reads types straight out of the
  `.svelte` files. The cost that was in question was measured on 2026-08-23 and is nil: a wrong
  prop type across the boundary produced `Type 'number' is not assignable to type 'string'`
  without a `.d.ts` anywhere. `packages/design/tsconfig.json` records it.

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
