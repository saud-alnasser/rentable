# node:test (TypeScript tests)

The TypeScript test runner. Tests are `.test.mjs` but import `.ts` source directly, so they
only run under `tsx` — that is what resolves the `$lib` alias and the TypeScript imports.
Running them with bare `node --test` fails on the first import.

Docs: <https://nodejs.org/api/test.html>. Fetch for filtering, concurrency, or the mocking
API — none of which this repository currently uses.

## Run every test

```bash
pnpm test
```

## Run one file

```bash
node --import tsx --test src/lib/api/routers/contract.test.mjs
```

This is the command to use while working. `--import tsx` is not optional.

## Run one test by name

```bash
node --import tsx --test --test-name-pattern "derived status is scheduled" src/lib/api/routers/contract.test.mjs
```

The pattern is a regular expression matched against the test name.
