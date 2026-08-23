---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: reference
use-when: "adding or regenerating a design primitive"
---

# shadcn-svelte

Generates the design primitives into `apps/desktop/src/lib/design/primitive/`. **That directory
no longer exists.** #780 moved the last of the 56 families into `@rentable/design`, and
`components.json` still names the old path, so the CLI would create it again from nothing. **Do
not run `add` until #783 repoints the aliases**, which is the whole of that ticket; what follows
describes the CLI rather than something to do today.

**There is no dependency and no `package.json` script** — unlike every other tool here, it is run
through `pnpm dlx`, so the version is whatever `@latest` resolves to on the day it runs.
Configured in `apps/desktop/components.json`; what its alias keys mean in this layout is in
[[rules/frontend]].

**Run it from `apps/desktop/`, not the repository root.** The CLI resolves `components.json`
and its aliases from the working directory, and the root has neither.

Docs: <https://shadcn-svelte.com/docs/cli>. Fetch before any command or flag not listed
below.

## Add a new primitive

```bash
pnpm dlx shadcn-svelte@latest add <component>
```

Writes to the `ui` alias — `$lib/design/primitive/` — and installs whatever the component
depends on unless `--no-deps-install` is passed.

**This is the only routine use of this CLI here.** `init` has already been run, and running
it again is not how a component is added. *Suspended since #780, per the note at the top. What
this writes today lands outside the package, reachable by no import and overwriting nothing, so
there is no error to notice it by.*

A newly generated primitive arrives with hard-coded English and no direction attribute.
Wiring it up is part of adding it, not a follow-up — [[rules/frontend]] has why. *What it is
wired to changed at #780. No primitive reads the i18n store of this application any more: the
words and the direction come from the contract in `@rentable/design/strings.js`, and `spinner` is
the shortest worked example.*

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
