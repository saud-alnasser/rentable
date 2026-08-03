# node:test (TypeScript tests)

The TypeScript test runner. Tests are `.test.mjs` but import `.ts` source directly, so they
only run under `tsx` — that is what resolves the `$lib` alias and the TypeScript imports.
Running them with bare `node --test` fails on the first import.

Docs: <https://nodejs.org/api/test.html>. Fetch for filtering or concurrency — neither of
which this repository currently uses.

## Run every test

```bash
pnpm test
```

## Run one file

```bash
node --import tsx --test src/lib/contract/router.test.mjs
```

This is the command to use while working. `--import tsx` is not optional.

## Mocking a module

```bash
node --import tsx --test --experimental-test-module-mocks src/lib/error/toast.test.mjs
```

`mock.module()` is behind `--experimental-test-module-mocks` — without it the call throws
rather than being ignored, and it is on the `pnpm test` script so the suite runs uniformly.
Verified on Node 24.18.0, where `node --help` still lists the flag as experimental and the
runner prints a warning per run.

Reach for it only where an import cannot be loaded at all: a module that reaches a
`.svelte` file fails under `tsx` with `ERR_UNKNOWN_FILE_EXTENSION`, and substituting it is
the only way to cover the code that imports it. Pass `exports`, not `namedExports` — the
latter is deprecated and warns.

## Run one test by name

```bash
node --import tsx --test --test-name-pattern "derived status is scheduled" src/lib/contract/router.test.mjs
```

The pattern is a regular expression matched against the test name.
