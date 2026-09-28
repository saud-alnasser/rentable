---
use-when: "deciding how a feature declares itself to the desktop shell in effort 840 (static list, self-registration or discovery), or checking what VS Code, IntelliJ, Android, Chromium, Apple platforms and Backstage do about it"
---

# Question

How do major applications and platforms let an in-app feature plug into the application shell,
so a feature is added or removed in one place? For each: is registration static, a runtime side
effect, or discovered? How do they keep type safety, ordering and testability, and how do they stop
features importing each other? Then: which of (A) a static typed list, (B) self-registration by
side-effect import, or (C) discovery by `import.meta.glob` fits `apps/desktop` under its tRPC,
`node --test`, Svelte 5 and single-bundle constraints?

Researched 2026-09-28 against the `_run` worktree of effort 840 (branch
`graphite/refactor/840-...`, HEAD `1aa8d6a5`, clean).

# Sources

Read 2026-09-28. All primary unless marked.

- **VS Code** (`microsoft/vscode` `main` at `6a4861eb`): wiki *Source Code Organization*
  (raw markdown); `src/vs/workbench/workbench.common.main.ts`; `src/vs/workbench/common/contributions.ts`;
  `src/vs/platform/registry/common/platform.ts`; `src/vs/platform/instantiation/common/extensions.ts`;
  `src/vs/platform/actions/common/actions.ts`; `src/vs/workbench/contrib/search/browser/search.contribution.ts`;
  `eslint.config.js`; `.eslint-plugin-local/code-layering.ts`, `code-no-deep-import-of-internal.ts`;
  `src/vscode-dts/vscode.d.ts`. Docs: code.visualstudio.com *Contribution Points*, *Activation Events*.
- **IntelliJ Platform**: `JetBrains/intellij-sdk-docs` `main`, `plugin_extensions.md`,
  `plugin_configuration_file.md`; plugins.jetbrains.com *Extension Points*.
- **Google**: dagger.dev *Multibindings*; developer.android.com *Common modularization patterns*;
  `android/nowinandroid` `main` at `a49ed253` (`settings.gradle.kts`, `app/.../ui/NiaApp.kt`,
  `app/.../navigation/TopLevelNavItem.kt`, `feature/foryou/impl/.../ForYouEntryProvider.kt`);
  Chromium `chromium/chromium` GitHub mirror `main`: `components/README.md`,
  `buildtools/checkdeps/README.md`, `docs/static_initializers.md`,
  `chrome/browser/profiles/chrome_browser_main_extra_parts_profiles.cc`. (googlesource returned
  503; the GitHub mirror is the same tree.)
- **Apple**: developer.apple.com documentation JSON for SwiftUI `App`, Xcode *Organizing your code
  with local packages*, `ExtensionKit`, ExtensionFoundation `AppExtensionPoint`;
  `pointfreeco/swift-composable-architecture` `main` (`README.md`, `Reducer/Reducers/Scope.swift`);
  `pointfreeco/isowords` `README.md`.
- **Web**: `backstage/backstage` `master` `docs/frontend-system/architecture/{10-app,15-plugins,20-extensions,36-routes}.md`;
  grafana.com *plugin.json reference* and *Anatomy of a plugin*; vite.dev *Features* (Glob
  Import); trpc.io *Merging Routers*.
- **This repository**: `apps/desktop/src/lib/api/router.ts`, `api/app.ts`, `design/acts.ts`,
  `layout/record-search.ts`, `layout/create.ts`, `tenant/host.svelte.ts`,
  `layout/component/frame.svelte`, `package.json`, `vitest.config.js`, `.aep/rules/testing.md`,
  `.aep/efforts/832-.../plan.md`.

# Findings

## VS Code: self-registration into typed registries, pulled in by one import list

1. *source* — Extensions declare static JSON in `package.json` `contributes` ("a set of JSON
   declarations", *Contribution Points*) and implement at runtime: `commands.registerCommand(...)`
   returns a `Disposable` (`vscode.d.ts:10990`). Since 1.74 contributed commands need no
   `onCommand` activation event (*Activation Events*). That is the third-party model: manifest plus
   runtime registration.
2. *source* — The workbench's own features use an internal mechanism: "At its core, the workbench
   does not have direct dependencies to all these contributions" (wiki, l.86). "Every contribution
   should have a single `.contribution.ts` file ... to be added to the main entry points", and "Only
   code that is referenced from the main entry files is loaded into the product" (wiki, l.96, 121).
3. *observation* — `workbench.common.main.ts` (489 lines) is a list of side-effect imports,
   e.g. `import './contrib/search/browser/search.contribution.js';` (l.274). `search.contribution.ts`
   registers itself at module load: `registerSingleton(...)` (l.43),
   `registerWorkbenchContribution2(id, ctor, WorkbenchPhase.AfterRestored)` (l.47),
   `Registry.as<IViewContainersRegistry>(...).registerViewContainer(...)` (l.53).
4. *observation* — Type safety of the registry is by convention: `Registry.as<T>(id: string): T`
   is an unchecked cast over a `Map` (`platform.ts:29`); `add` asserts no duplicate id (l.39).
   `registerSingleton` pushes onto a module-level array (`extensions.ts:32`). Ordering: menu items
   carry `order?: number` (`actions.ts:26`); contributions order by lifecycle phase
   (`contributions.ts:31-61`).
5. *source/observation* — Layering is enforced by lint, not by the registry. The wiki: "there
   cannot be any dependency from outside `vs/workbench/contrib` into `vs/workbench/contrib`"; "a
   contribution should never reach into the internals of another contribution" — only its single
   exported API file (wiki, l.95-100). `eslint.config.js` `local/code-import-patterns` gives
   `src/vs/workbench/~` (the core) no `contrib` import except under tests (l.1812-1826), and names
   `workbench.common.main.ts` as the file allowed to import `vs/workbench/contrib/*/~` (l.2003-2019).
   `local/code-layering` restricts `common`/`browser`/`node` targets (l.116);
   `code-no-deep-import-of-internal` is an error-level rule (l.115).

## IntelliJ Platform: static manifest, typed extension points

6. *source* — Extension points are declared in `plugin.xml` with `interface` or `beanClass`, and
   read in code through `ExtensionPointName.create("...").getExtensionList()` (*Extension Points*).
   Extensions are declared in `<extensions defaultExtensionNs=...>` (`plugin_extensions.md`).
   Ordering is declarative: `order="first" | "last" | "before id" | "after id"`, combinable, with
   `first`/`last` not guaranteed among several (`plugin_configuration_file.md`, l.611-623).
   Implementations "must be stateless", do no constructor or static initialization
   (`plugin_extensions.md`, l.100-102). `dynamic="true"` points are "enumerated on every use" so a
   plugin can unload (*Extension Points*).

## Google: static composition, compile-time multibinding, build-enforced layering

7. *source* — Dagger multibindings exist for "a plugin architecture, for example, where several
   modules can contribute individual plugin interface implementations"; `@IntoMap` key collisions
   are "a compile-time error"; the page says nothing of set ordering (dagger.dev).
8. *source* — Android's guide: "App modules are an entry point to the application. They depend on
   feature modules and usually provide root navigation"; cross-feature traffic goes through a
   mediator, "usually an app module", that owns the navigation graph; features depend on an
   abstraction module, not an implementation (*Common modularization patterns*).
9. *observation* — Now in Android splits each feature `:feature:X:api` / `:feature:X:impl`
   (`settings.gradle.kts` l.69-79). Each impl exports one function, `forYouEntry(navigator)`
   (`ForYouEntryProvider.kt`); the app composes them in one literal block,
   `entryProvider { forYouEntry(navigator); bookmarksEntry(navigator); ... }` (`NiaApp.kt` l.259-264),
   and keeps the top-level nav items as one `mapOf(...)` (`TopLevelNavItem.kt`). A feature impl may
   import another feature's `api` (`ForYouEntryProvider.kt` imports `feature.topic.api`). No
   runtime registry.
10. *source* — Chromium components "**cannot** depend on the higher layers" (`//chrome`, ...), "can
    depend on each other. This must be made explicit in the `DEPS` file", and "Circular dependencies
    are not allowed" (`components/README.md` l.74-111). `checkdeps` reads `include_rules` with `+`
    allow, `-` deny, `!` allowed-for-now-with-warning (`checkdeps/README.md`).
11. *source/observation* — Chromium bans static initializers and counts them in CI
    (`docs/static_initializers.md`), so a factory cannot register itself at load. Instead
    `EnsureBrowserContextKeyedServiceFactoriesBuilt()` calls `XFactory::GetInstance()` for every
    factory in one hand-kept, alphabetised list; calling it is what makes the factory register its
    dependencies with a global manager. The comment admits the cost: "I don't think putting every
    FooServiceFactory here will scale" (`chrome_browser_main_extra_parts_profiles.cc` l.676-730).
    That is the VS Code shape again: self-registration triggered from one explicit list.

## Apple platforms: static composition in code

12. *source* — A SwiftUI app composes its scenes statically in `var body: some Scene` —
    `WindowGroup { ... }` and `Settings { ... }` — with "exactly one entry point" (`App` docs).
13. *source* — Apple's modularity guidance is local Swift packages the app target adds as
    dependencies in its General pane (*Organizing your code with local packages*). It says nothing
    about registration.
14. *source* — ExtensionKit is for code bundles from *other* apps: a host declares
    `AppExtensionPoint` definitions, extensions `@AppExtensionPoint.Bind`, the compiler writes both
    into the bundle, and "the system collects definition and binding information at installation
    time" (`AppExtensionPoint` docs). *interpretation* — out-of-process, installation-time discovery;
    not a model for features compiled into one app.
15. *source* — TCA composes explicitly: `Scope` "embeds a child reducer in a parent domain" so
    features "can even be packaged into their own isolated modules" (`Scope.swift` l.1-6). isowords
    is "split into 86 modules" and builds "mini-applications" of a subset for previews and an App
    Clip (isowords `README.md` l.53, 79).

## Web

16. *source* — Backstage plugins are values: `createFrontendPlugin({ pluginId, extensions: [...] })`,
    the package's default export (`15-plugins.md`), installed via `createApp({ features: [...] })` or
    by feature discovery, which "is hooked into the WebPack compilation process" and needs the
    Backstage CLI (`10-app.md` l.19-47). Extensions attach to a parent input by id; attachment is
    checked against typed extension data refs (`createExtensionDataRef`); the tree cannot cycle;
    ordering follows configuration (`20-extensions.md` l.34-42, 131-135). Plugins communicate
    through `RouteRef`s rather than imports (`36-routes.md` l.10).
17. *source* — Grafana discovers by filesystem: at start it "scans the plugin folders and mounts
    every folder that contains a `plugin.json`" (*plugin.json reference*); `module.ts` is the
    frontend entry (*Anatomy*).
18. *source* — `import.meta.glob` "is a Vite-only feature", lazy by default, `eager: true` for
    side-effect modules, arguments "must be passed as literals" (vite.dev). tRPC composes with
    `router({ user: userRouter, ... })` and infers the client from `typeof appRouter` (trpc.io).

## This repository

19. *observation* — `api/router.ts` builds `appRouter = router({ app, tenant, complex, contract,
    history, workspace })` and exports `AppRouter = typeof appRouter`; `api/app.ts` nests
    `settings`, `remoteSync`, `organization`.
20. *observation* — Under `node --import tsx`, `import.meta.glob(...)` fails:
    `TypeError: define_import_meta_default.glob is not a function` (run in scratchpad, Node
    24.18.0, the repository's tsx). `.aep/rules/testing.md` l.104 records that `node:test` cannot
    load `.svelte` (`ERR_UNKNOWN_FILE_EXTENSION`), and l.110-111 that runes outside a `.svelte.`
    file raise `rune_outside_svelte`. `api/tests/testing.ts` imports `$lib/api/*` and i18n under
    `node:test`, so the router graph must stay Node-loadable.
21. *observation* — `design/acts.ts` rejects a runtime registry: it "makes a card's menu depend on
    what happened to be registered when it drew"; plan 832 records the same rejection. The shell's
    lists today (`record-search.ts`, `create.ts`, `frame.svelte` l.3-8, 210-217) import each
    concept's `host.svelte` and `component/host.svelte` directly.

# Conclusion

**What the sources do.** No platform surveyed uses unanchored discovery for features compiled into
one app. Discovery appears only where the unit is installed separately: Grafana folders, Backstage
packages (through a bundler hook), ExtensionKit bundles. For in-app features the two shapes are:

- **Static composition** — Now in Android, SwiftUI, TCA, Backstage's `features: [...]`: the app
  holds a literal list of feature values. Types flow from the list.
- **Self-registration anchored by one import list** — VS Code, and Chromium in effect: each
  feature registers itself into typed registries in its own entry file, and one file imports every
  entry file. Adding a feature is one directory plus one line there.

Every one of them enforces "features do not import each other" with a build or lint check (VS Code
`code-import-patterns`, Chromium `DEPS`, Gradle module boundaries, Swift package targets,
Backstage `RouteRef`s), never with the registration pattern itself.

**Against this repository's constraints** (interpretation):

- **(C) glob discovery** fails two hard constraints. It does not run under `node --test` (finding
  20), and a glob returns one element type for every match, so per-feature router types cannot
  reach `typeof appRouter`.
- **(B) pure self-registration** leaves the router untyped: a router pushed into a registry at
  import is invisible to `typeof`. Recovering types would need module augmentation (the device
  `10-app.md` l.107 uses), whose types stay true even when the import that registers at runtime
  is missing. It is also the ordering-by-import-accident this codebase already rejected
  (finding 21), and Chromium bans it outright (finding 11).
- **(A) a typed list** satisfies tRPC, Node tests and tree-shaking without special handling. It is
  what NiA, SwiftUI and Backstage do.
- **The VS Code hybrid** — one entry file per feature, one import list — gives the human's "a
  feature declares itself" at the feature end. The list still has to exist for `typeof appRouter`,
  and at that point (A) with the entry exporting a *value* rather than registering is the same
  shape without the hidden mutable state.

**What the findings point to** (the decision is the orchestrator's): (A) in VS Code's layout. Each
feature has one entry that *exports* its declaration, the shell iterates one typed list, and a lint
or test makes the layering the enforcement. Two layers are required, because the Node-loadable half
cannot import `.svelte` (finding 20). This mirrors VS Code's `common`/`browser` split
and NiA's `api`/`impl`:

```
src/lib/feature.ts            // defineFeature + types; imports no feature
src/lib/features.ts           // THE list, Node-safe: [tenant, complex, contract, ...] as const
src/lib/features.shell.ts     // the shell half, Vite-only: [tenantShell, complexShell, ...]
src/lib/tenant/index.ts       // tenant's public entry: router, kind, cache prefix, history, transfer
src/lib/tenant/shell.ts       // nav, breadcrumb, glyph, create, search, acts, host component
```

```ts
// tenant/index.ts
export const tenant = defineFeature({
	kind: 'tenant', router: tenantRouter, cachePrefix: 'tenant', history: 'tenant', transfer
});
// features.ts
export const features = [tenant, complex, contract, payment, history, workspace] as const;
export type RecordKind = Extract<(typeof features)[number], { kind: string }>['kind'];
// api/router.ts
export const appRouter = router(routersOf(features)); // mapped type keyed by each feature's id
export type AppRouter = typeof appRouter;
```

`routersOf` would need a key-remapping type over the `as const` tuple, because
`Object.fromEntries` widens to `Record<string, T>`. The fallback that certainly preserves types is
a literal `router({ tenant: tenant.router, ... })` in `features.ts`. Either keeps the one list. The
shell (`layout`, `api`, `design`, `history`, `workspace`) then imports only `features*.ts`, and
acceptance criterion 2's test is the analogue of VS Code's `code-import-patterns` rule for
`src/vs/workbench/~`.

Confidence: high on what each platform does (primary source for each); medium on the fit, which is
interpretation; the `routersOf` typing is unverified.

# Not checked

- Whether a mapped type over an `as const` tuple type-checks through tRPC 11's `router()` and
  `createCaller` without a cast. Not built.
- Shopify's app extensions and any SvelteKit community plugin pattern: not searched.
- Dagger set ordering: the page is silent (finding 7); Hilt docs not read.
- Tooling for criterion 2/5's check (eslint `no-restricted-imports`, eslint-plugin-boundaries,
  dependency-cruiser): not evaluated.
- Rust side (requirement 9: `generate_handler!` fed from feature modules, the `inventory` crate):
  out of this question.
- Whether per-feature i18n files compose under typesafe-i18n: out of this question.
- Tree-shaking was not measured. Every feature ships in the one desktop bundle, so its weight here
  is inferred to be small.
