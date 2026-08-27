---
status: resolved
---

# chore(desktop): four devDependencies nothing has ever imported are removed

## Outcome

`apps/desktop/package.json` no longer declares `@fontsource/fira-mono`, `@neoconfetti/svelte`,
`@tailwindcss/forms` or `@tailwindcss/typography`, and the lockfile no longer carries them.

## Acceptance Criteria

Traces requirement 1 and requirement 2 of the spec, and its criterion 1, criterion 2 and
criterion 3.

- [x] The four are removed from `apps/desktop/package.json`, and `pnpm install` prunes them
      from `pnpm-lock.yaml`. Removed with
      `pnpm --filter ./apps/desktop remove @fontsource/fira-mono @neoconfetti/svelte
      @tailwindcss/forms @tailwindcss/typography`, which took the four manifest lines and 61
      lines of lockfile with them: the four `importers` entries, the four `packages` entries
      and the four `snapshots` entries. `grep -c -E "fira-mono|neoconfetti|@tailwindcss/(forms|typography)"`
      returns `0` against both files afterwards, and a following `pnpm install` reported
      `Lockfile is up to date` and left the tree clean.
- [x] Each one is confirmed unimported at the point of removal rather than on the strength of
      this ticket, because a Tailwind plugin can be registered from a stylesheet and a font
      package from an `@import`. Measured on `c75f02ad` over every tracked file, excluding the
      manifests, the lockfile and `.aep/`:

      ```
      @fontsource/fira-mono    0
      @neoconfetti/svelte      0
      @tailwindcss/forms       0
      @tailwindcss/typography  0
      ```

      The two weaker signals were read directly rather than inferred from that count.
      `git grep -n "@plugin"` returns nothing anywhere in the tree, so neither Tailwind plugin
      is registered from a stylesheet, and there is no `tailwind.config.*` for one to be
      registered in. `apps/desktop/src/app.css` carries `@import 'tailwindcss'`,
      `@import 'tw-animate-css'` and `@import '@rentable/design/tokens.css'` and names none of
      the four. `packages/design/src/lib/tailwind.ts` is the `cn` helper rather than a config.
      `@tauri-apps/cli`, `@types/better-sqlite3` and `@types/node` are untouched.
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build:web` and `pnpm build` pass. `check`
      reported `0 ERRORS 0 WARNINGS` from both `svelte-check` runs and `All matched files use
      Prettier code style!`; `lint` the same, with `eslint .` silent. `test` ran
      `4 successful, 4 total` turbo tasks, the control plane's 168 at `pass 162 fail 0
      skipped 6`, where the six skip themselves for want of live Turso credentials.
      `build:web` wrote the static site; `build` finished the release profile in 2m 32s,
      bundled the msi and the nsis installer and signed both updater artifacts, exit 0.

      **`pnpm build` needs `apps/desktop/.env`, which is gitignored and so absent from a fresh
      worktree.** The first run bundled both installers and then failed on
      `TAURI_SIGNING_PRIVATE_KEY`; copying the file in from the main checkout cleared it. That
      is a property of building anywhere but the checkout the file lives in, not of this
      change.

## Relevant areas

`apps/desktop/package.json`, under `devDependencies`.

`apps/desktop/src/app.css` is where two of the four would be registered if they were used at
all.

## Constraints

- **`@tauri-apps/cli`, `@types/better-sqlite3` and `@types/node` also have no import site and
  must stay.** The spec's second constraint has the reason. A sweep driven by import counts
  alone takes all three.

## Notes

Found at #784, which read the desktop's manifest against what was left after the design system
moved into `@rentable/design`, and raised as #803.

The measurement taken then, over `src/`, `static/`, `scripts/`, the config files and the root
tooling config:

```
@fontsource/fira-mono    0
@neoconfetti/svelte      0
@tailwindcss/forms       0
@tailwindcss/typography  0
```

And over the whole history, excluding manifests and the lockfile:

```
$ git log --oneline -S"@neoconfetti/svelte" --all --name-only \
    -- ':(exclude)**/package.json' ':(exclude)pnpm-lock.yaml'
b72c6a48 refactor(repo): the desktop application becomes a workspace package (#506)
package.json
aa7cbc78 initial commit
package.json
```

The other three return the same two commits, and in both the file is the root `package.json`.
