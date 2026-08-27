---
use-when: "adding or regenerating a design primitive"
---

# shadcn-svelte

Generates the design primitives into `packages/design/src/lib/primitive/`. Fifty-five of the
56 families there came from it and are hand-maintained since. `callout` is the one written here,
and the registry has no such component, so there is nothing to regenerate it from.

**There is no dependency and no `package.json` script** — unlike every other tool here, it is run
through `pnpm dlx`, so the version is whatever `@latest` resolves to on the day it runs. The run
below was 1.5.0.

Configured in `packages/design/components.json`; what its alias keys mean in this layout is in
[[rules/frontend]]. *It was `apps/desktop/components.json` until #783. The CLI resolves
`components.json` from its working directory, which is why moving the file is the whole of
pointing the tool somewhere else.*

Docs: <https://shadcn-svelte.com/docs/cli>. Fetch before any command or flag not listed
below.

## Add a new primitive

```bash
pnpm dlx shadcn-svelte@latest add <component> --cwd packages/design -y
pnpm exec prettier --write packages/design/src/lib/primitive/<component>
```

**`-c, --cwd <path>` sets the working directory**, and the working directory is the only thing
that tells this CLI which project it is writing to. Run from the repository root without it and
there is no `components.json` to find; run it from `packages/design/` instead and the flag is
unnecessary. Prefer the flag, because the path is then written down rather than assumed of
whoever reads the command.

`-y` skips the confirmation prompt. It is needed for any non-interactive run — without it the
CLI stops at *Ready to install components and dependencies?* and writes nothing. **It is safe
here only because `--overwrite` is never passed**; see the table below.

**Formatting is a second step, not a nicety.** What the CLI writes is not Prettier-clean under
this repository's configuration, so `pnpm check` and `pnpm lint` both fail on a freshly generated
family until it is formatted. Measured at #783: five generated files, five Prettier warnings,
zero after `--write` and zero ESLint findings either side. **Scope the write to what was just
generated.** `pnpm format` is `prettier --write .` across the workspace, which on a clone that has
not been renormalised rewrites every line ending in the tree; [[references/prettier]] has why.

Writes to the `ui` alias — `#lib/primitive/` — and installs whatever the component depends on
unless `--no-deps-install` is passed.

**This is the only routine use of this CLI here.** `init` has already been run, and running
it again is not how a component is added. Moving `components.json` at #783 was a file move, not
a re-initialisation.

### What it writes for its own imports

**The generated file names the package's internal alias by itself**, which is the property that
chose subpath imports for this package over self-reference. Both forms carry a file extension, so
neither needs the boundary normalisation the spec's `# Migration` describes:

| The registry writes | It arrives as |
| --- | --- |
| `$UTILS$.js` | `import { cn, type WithElementRef } from "#lib/tailwind.js";` |
| `$UI$/<family>/index.js` | `import { buttonVariants } from "#lib/primitive/<family>/index.js";` |

The first was observed in the generated file at #783. The second was read out of the registry's
own `alert-dialog.json`, whose action and cancel parts import `button` that way; no family
generated so far has needed it.

**A newly generated primitive arrives with hard-coded English and no direction attribute, and
wiring it up is part of adding it rather than a follow-up.** What it is wired to is the contract
in `#lib/strings.js` — `contract.strings` for a word, `contract.direction` for `dir` on the
rendered element. **Not this application's i18n store**: a packaged primitive that imports
`$lib/i18n` does not compile, because `$lib` has no meaning inside the package.
[[rules/frontend]] has why, and the shortest worked examples are `spinner` for a string and
`card` for a direction. *This said "the i18n store" until #783, and it was true while the
primitives lived in `apps/desktop/`.*

### What the first run into the package cost, so the next one does not pay it

```
$ pnpm dlx shadcn-svelte@latest add alert --cwd packages/design -y
┌   shadcn-svelte  v1.5.0
│
◇  Components to install:
│  alert
│
◇  alert installed at src\lib\primitive\alert
│
└  Success! Components added.
```

- **`lib` is stated in `components.json` like the other four**, and this is the ticket that found
  out why. Omitted, the CLI defaults it to `$lib` and then refuses its own default:
  `Config Error: Invalid import alias found: ("lib": "$lib") in components.json.` The package's
  `tsconfig.json` maps `#lib/*` and nothing maps `$lib`. [[rules/frontend]] carries the key.
- **The CLI validates every alias against tsconfig `paths` before it fetches anything**, so a
  wrong alias costs a second rather than a half-written tree.
- **A bare `#lib` entry in `paths` is not needed**, although the prototype that measured this
  package carried one. `#lib/*` alone satisfies the validator for `hooks` and `lib`, which
  both name `#lib` with nothing after it.
- **It writes one thing outside the family it was asked for: `packages/design/.svelte-kit/`.**
  The preflight runs `svelte-kit sync` in the target whenever `@sveltejs/kit` is among its
  dependencies and that directory is absent, so this package gets a route-types tree although it
  has no routes and no `kit` block. It is gitignored and `svelte-check` does not read it, so
  nothing reports it and no diff can carry it. The failure mode is worth more than the directory:
  if that sync fails, the run aborts before fetching anything, with `Failed to run 'pnpm exec
  svelte-kit sync'. Ensure that your dependencies have been installed first`.
- **Nothing else was touched** — no other family, no write into the file named by `tailwind.css`,
  no `package.json` or lockfile edit. **Not because `alert` is dependency-free**: it declares
  `tailwind-variants@^3.2.2`, as 50 of the 56 families declare something. The CLI drops any
  dependency the installed range already satisfies, and this package carries
  `tailwind-variants@^3.3.1`. Add a family whose declared range is *not* satisfied and it edits
  `packages/design/package.json` and installs, unless `--no-deps-install` is passed.

## The flags that replace existing files

Primitives are hand-maintained after generation, so a flag that rewrites one destroys work
no regeneration reproduces. Three are documented:

| Flag              | On     | What it does                                                    |
| ----------------- | ------ | --------------------------------------------------------------- |
| `-o, --overwrite` | `add`  | replaces existing files. Default `false` — **this is the one**   |
| `--reinstall`     | `init` | reinstalls existing components when the style changes            |
| `-a, --all`       | `add`  | installs every component; harmless alone, total with `--overwrite` |

`add` without `--overwrite` is safe on a component that already exists — the default is
documented as `false`. **What it does instead, prompt or skip silently, is not documented
and was not tested here**, and `-y, --yes` suppresses confirmation prompts generally. So the
default is not a guard to rely on: do not pass `--overwrite`, rather than passing it and
expecting to be asked.
