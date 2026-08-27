---
status: open
---

# chore(desktop): four devDependencies nothing has ever imported are removed

## Outcome

`apps/desktop/package.json` no longer declares `@fontsource/fira-mono`, `@neoconfetti/svelte`,
`@tailwindcss/forms` or `@tailwindcss/typography`, and the lockfile no longer carries them.

## Acceptance Criteria

Traces requirement 1 and requirement 2 of the spec, and its criterion 1, criterion 2 and
criterion 3.

- [ ] The four are removed from `apps/desktop/package.json`, and `pnpm install` prunes them
      from `pnpm-lock.yaml`.
- [ ] Each one is confirmed unimported at the point of removal rather than on the strength of
      this ticket, because a Tailwind plugin can be registered from a stylesheet and a font
      package from an `@import`.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build:web` and `pnpm build` pass.

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
