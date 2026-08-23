---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: reference
mode: [implement, test]
use-when: "running or writing a component test"
---

# Vitest (component tests)

The second test runner, and it runs in `packages/design/` alone. [[rules/testing]], under
*Component tests*, governs which of the two runners a test belongs to and how it is named;
[[references/node-test]] is the other one's reference. What this file carries is the invocations.

`packages/design/vitest.config.js` is the configuration and the authority on what is collected.
Read it rather than a copy: its comments record what each setting was measured to do, and a
second statement of the glob here would be the copy that goes stale.

Docs: <https://vitest.dev/>. Fetch for filtering, coverage or the browser mode, none of which
this repository uses.

Every command below was run against `vitest` 4.1.11 on 2026-08-23.

## Run every test

```bash
pnpm test
```

From the root, through `turbo run test`, which runs both runners. `pnpm --filter @rentable/design
test` runs this one alone and skips the cache.

## Run one file

```bash
cd packages/design && npx vitest run src/tests/probe.svelte.test.ts
```

This is the command to use while working. **`run` is not optional**: bare `npx vitest` starts the
watcher, which never exits, and in an automated run that is a hang rather than a result.

## Run one test by name

```bash
cd packages/design && npx vitest run -t "a prop change reaches the dom"
```

`-t` is a substring or regular expression matched against the test name. Everything it does not
match is reported as **skipped** rather than dropped, so the summary line counts the whole file.

## When `mount` throws a Svelte error

The browser condition is not being applied. Svelte's own `exports` map sends `browser` to
`index-client.js` and everything else to `index-server.js`, and the server build has no working
`mount`, so every test in the file fails from inside `svelte/src/index-server.js`. Measured on
2026-08-23 by deleting the `resolve` line, which is what a reader who thinks it is decoration
would do.

## Never run

```bash
npx vitest            # the watcher. Long-running, never exits
```
