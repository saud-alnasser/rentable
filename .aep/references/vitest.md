---
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
test` skips the cache, and since #778 it is not this runner by itself: the package's own script
runs `node:test` first and Vitest after. `npx vitest run` in `packages/design/` is what runs this
one alone.

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

## When every test passes and the run still fails

Read the line above the summary before reading the summary. Vitest fails a run on an
**unhandled error** as readily as on a failed assertion, and the summary makes that look like a
contradiction:

```
 Test Files  14 passed (14)
      Tests  44 passed (44)
     Errors  2 errors
```

The one this repository has met is bits-ui's deferred body-scroll restore. A component that locks
body scroll schedules the restore on a 24ms timer rather than running it on unmount, so the last
unmount in a file races Vitest's teardown of the jsdom environment, and the loser reaches a
`document` that is gone:

```
ReferenceError: document is not defined
 ❯ Proxy.resetBodyStyle bits-ui/dist/internal/body-scroll-lock.svelte.js:34:9
 ❯ Timeout.cleanupFn [as _onTimeout] body-scroll-lock.svelte.js:69:17
```

**`src/tests/setup.ts` is what holds it off**, named by `setupFiles`, and it is scaffolding rather
than a test: an `afterAll` that waits out the timer once per file. The file carries the reasoning,
including why the hook is `afterAll` and not `afterEach`.

Two things about it are worth knowing before trusting a green run:

- **It is a race, so it moves.** Measured across three CI runs of the same suite on 2026-08-23:
  one error from `command.svelte.test.ts`, two from `delete-dialog` and `selection-dialog`, and
  none at all. It never reproduced on Windows locally, which is where it was looked for first.
- **A component this reaches is any bits-ui surface that locks scroll** — dialog, sheet, command
  dialog, and every block built on one. A new test that mounts one inherits the guard rather than
  needing its own.

## When an import fails to resolve rather than a test failing

```
Failed to resolve import "$app/navigation" from "src/lib/block/record-surface.svelte".
```

**This runner knows nothing about SvelteKit.** `vitest.config.js` loads the Svelte plugin and
nothing else, so `$lib`, `$app/*` and `$env/*` are ordinary unresolvable specifiers here. The
package is allowed to import `$app/*` and four of its modules do, so this is a gap in the runner
rather than a mistake in the subject: the run fails at load, before any test executes, and the
message names the specifier rather than the assertion.

Nothing in the package works around it today, which is why `record-surface` and `back-control`
have no tests. #797 is the ticket. Until it lands, a component that reaches `$app/*` cannot be
rendered under this runner, and the check to run before writing the test is whether the subject
or anything beneath it imports one.

Measured on 2026-08-23 at #781, on `record-surface.svelte`.

## Never run

```bash
npx vitest            # the watcher. Long-running, never exits
```
