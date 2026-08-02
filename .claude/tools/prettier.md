# prettier

The formatter, and half of the CI gate — `pnpm check` runs `prettier --check .`, so a
formatting miss fails the run exactly like a type error. Configured in `.prettierrc`: tabs,
single quotes, no trailing commas, **printWidth 100**, with the Svelte and Tailwind plugins
loaded.

Docs: <https://prettier.io/docs/en/options>. Fetch before changing an option or adding a
plugin — the Tailwind plugin must stay last in the `plugins` array or it stops sorting
classes.

## Format, and check without writing

```bash
pnpm format                    # prettier --write .
pnpm exec prettier --check .   # what CI runs, via `pnpm check`
```

`pnpm lint` also runs the check, so `pnpm check` and `pnpm lint` overlap on prettier. That
is why CI runs `pnpm exec eslint .` directly rather than `pnpm lint` — see `eslint.md`.

## Format one file

```bash
pnpm exec prettier --write src/lib/contract/router.ts
```

## What prettier does not touch

`.prettierignore` excludes the lockfiles, `/static/`, `build`, `tauri/target`, the
generated `src/lib/i18n/i18n-*.ts`, and **`/.claude/`**.

The `.claude/` entry is load-bearing rather than cosmetic. The guides and tool references
under there are copied verbatim from the workflow's templates and are verified byte-for-byte
against their source; reflowing them to printWidth 100 would break that check and make every
re-run of `/aep:configure` show a spurious diff. It also keeps knowledge from being rewritten
on the formatter's schedule, which turns a readable diff into an unreadable one.

`CLAUDE.md` is deliberately **not** ignored — it is authored in this repository rather than
copied, so it stays format-enforced with the rest of the root.

The Svelte plugin means `.svelte` files are formatted by prettier, not by any editor-specific
formatter. Check `.vscode/` settings before blaming prettier for a diff it did not make.

## On Windows, `--check` fails on every file, and `--write` is a trap

`prettier --check .` reports dozens of files here while CI is green on the same commit. The
files are not misformatted — the line endings differ. Git stores LF, this clone has
`core.autocrlf=true`, so checkout rewrites everything to CRLF, and prettier's default
`endOfLine: "lf"` flags each converted file. CI runs on `ubuntu-latest`, checks out LF, and
sees nothing wrong.

**Do not "fix" it with `pnpm format`.** That rewrites every file to LF in the working tree
and produces a diff of the whole repository that has nothing to do with the change being
made.

Use `--end-of-line auto`, which honours each file's existing endings and leaves the real
formatting rules intact:

```bash
pnpm exec prettier --check . --end-of-line auto      # the true local signal
```

On a correctly formatted tree that passes clean, so a failure from it is a genuine one.
Verified: `pnpm check` reports 44 files on this clone while the same commit is clean under
`--end-of-line auto`.

`.gitattributes` now carries `* text=auto eol=lf`, which settles this for every fresh clone
and every file as it is next checked out. It does **not** retroactively rewrite files already
sitting in a working tree — an existing clone keeps its CRLF copies, and `--end-of-line auto`
stays the honest local read until they are renormalized.
