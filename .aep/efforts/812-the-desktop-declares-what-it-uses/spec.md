---
status: accepted
---

# Problem

`apps/desktop/package.json` declares four devDependencies that no file in this repository has
ever imported: `@fontsource/fira-mono`, `@neoconfetti/svelte`, `@tailwindcss/forms` and
`@tailwindcss/typography`. They are SvelteKit template residue, carried since the first commit.

Measured over `src/`, `static/`, `scripts/`, the config files and the root tooling config,
matching import, require and CSS `@import` specifiers, all four return zero. Over the whole
history, excluding manifests and the lockfile, the only commits that touch any of the four
strings are the initial commit and the monorepo move at #506, and in both the file is the root
`package.json`.

What a dead declaration costs is not install time. It is that the manifest stops being readable
as a statement of what this application uses, so the next person deciding whether something can
be removed has to measure rather than read, and a sweep driven by import counts alone takes
things that are genuinely load-bearing.

**These are not residue from the design package effort.** That effort found ten devDependencies
dead because of it and removed them at #784. These four were dead before it started, and were
left rather than folded into a diff whose reviewability depends on being about one thing.

# Goal

`apps/desktop/package.json` declares what the desktop application actually uses.

# Scope

`apps/desktop/package.json` under `devDependencies`, and `pnpm-lock.yaml`.

# Requirements

1. The four named devDependencies are gone from the manifest and from the lockfile.
2. Each removal is justified by a measurement taken at the point of removal.

# Acceptance Criteria

1. `@fontsource/fira-mono`, `@neoconfetti/svelte`, `@tailwindcss/forms` and
   `@tailwindcss/typography` are removed from `apps/desktop/package.json`, and `pnpm install`
   prunes them from `pnpm-lock.yaml`.
2. Each one is confirmed unimported at the point of removal rather than on the strength of this
   spec.
3. `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build:web` and `pnpm build` pass.

# Constraints

- **Confirm before removing.** The measurement above was taken at one commit and the tree moves.
  *Why: a Tailwind plugin can be registered from a stylesheet and a font package from an
  `@import`, so an import count is a weaker signal than it looks.*
- **`@tauri-apps/cli`, `@types/better-sqlite3` and `@types/node` also have no import site and
  must stay.** The first is resolved by name through `pnpm exec tauri` in
  `apps/desktop/scripts/tauri-with-env.mjs`, and the other two are ambient type packages. *Why
  this is stated as a constraint rather than left to judgement: a sweep driven by import counts
  alone takes all three, and the failure is at build time on somebody else's machine.*

# Out of Scope

- **The root manifest and the other two workspace packages.** This effort is about one file. A
  workspace-wide audit is a different decision with a different blast radius.
- **A gate that would catch the next one.** Worth having and not this.

# Assumptions

- Nothing outside the paths measured resolves any of the four by name. `apps/desktop/src/app.css`
  is where two of them would be registered if they were used at all: it carries
  `@import 'tailwindcss'`, `@import 'tw-animate-css'` and `@import '@rentable/design/tokens.css'`,
  and names none of these.
