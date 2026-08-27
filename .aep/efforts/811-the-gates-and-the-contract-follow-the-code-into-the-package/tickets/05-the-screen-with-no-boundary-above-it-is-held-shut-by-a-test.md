---
status: resolved
---

# test(desktop): the screen with no boundary above it is held shut by a test rather than by three comments

## Outcome

`apps/desktop` can render a component in a test, and rendering the startup subtree outside its
providers fails one, with a message that names the guard that was dropped.

## Acceptance Criteria

Traces requirement 6 and requirement 7 of the spec, and its criterion 6 and criterion 7.

- [x] `apps/desktop` can render a component in a test. `apps/desktop/vitest.config.js` follows
      `packages/design/vitest.config.js` line for line except the plugin, which is `sveltekit()`
      rather than `svelte()` because a component here reaches `$lib/...` and `$app/...`;
      `src/tests/setup.ts` carries the same bits-ui scroll-restore wait; and `vitest`, `jsdom` and
      `@testing-library/svelte` joined the desktop's `devDependencies`. The `test` script is now
      the extglob and then `vitest run`, as the package's is. **The split was measured, not
      assumed**: the new glob collects `ℹ tests 877 / pass 877 / fail 0` under `node:test` plus
      `Test Files 1 passed / Tests 3 passed` under vitest, and the old `src/**/*.test.ts` collects
      `ℹ tests 878 / pass 877 / fail 1`, which is the misleading shape `[[rules/testing]]`
      describes. Nothing was dropped and the component file is off `node:test`.
- [x] A test renders `startup-unreadable` with no `DesignProvider` and no `TooltipProvider`
      above it, as `+layout.svelte` does, and it passes.
      `apps/desktop/src/lib/layout/tests/startup-unreadable.svelte.test.ts` renders it with no
      wrapper at all and asserts the name, the message and both controls' accessible names.
- [x] Removing `tooltip={false}` from either call site in `startup-unreadable.svelte` makes that
      test fail, and the failure names the provider rather than surfacing as an unrelated render
      error. Measured on both call sites in turn: each gives `1 failed | 2 passed` and
      `Error: Context "Tooltip.Provider" not found`, thrown by `Tooltip.Root` while rendering.
- [x] Giving `StandaloneSurface` a `busy`, or a tone other than `error`, makes it fail the same
      way. **It takes both, and the `or` in this line was wrong.** Measured one mutation at a
      time: `busy` added with `tone="error"` kept gives `3 passed`; `tone="error"` dropped with no
      `busy` gives `3 passed`; the two together give `1 failed | 2 passed` and
      `Error: a @rentable/design component rendered outside DesignProvider`. That is what
      `startup-unreadable.svelte`'s own comment already said, and the spec's criterion 7 is
      corrected to match. The suite holds the mechanism rather than one mutation: the third test
      renders `StandaloneSurface` busy and untoned directly and asserts on that throw.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass. `check` reported
      `0 ERRORS 0 WARNINGS` on 2803 and 9208 files; `lint` printed the prettier line and nothing
      else; `test` reported `Tasks: 4 successful, 4 total`; `build:web` reported
      `Tasks: 1 successful, 1 total`.

## Relevant areas

`apps/desktop/src/routes/+layout.svelte` renders `DesignProvider` and `TooltipProvider` inside
the locale gate. The branch below the gate, the one that draws `startup-unreadable` when the
application failed before it could load a dictionary, is outside both. It is the one screen with
no error boundary above it and no way out but quitting: if it throws, the window stays empty.

`apps/desktop/src/lib/layout/component/startup-unreadable.svelte` holds both guards. Two things
could make it throw, and both are held shut by a prop value rather than by structure:

| The way in | What stops it | Where |
| --- | --- | --- |
| `StandaloneSurface` draws a packaged `Spinner` | `tone="error"` takes the branch with no spinner, and no `busy` gates the spinner in the other | `startup-unreadable.svelte` |
| `SurfaceAction` draws a packaged `Tooltip` | `tooltip={false}`, against a prop that defaults to `true` | `startup-unreadable.svelte:89` and `:99` |

`apps/desktop/src/lib/layout/tests/startup-surface.test.ts` pins the two label strings and says
nothing about `tone`, `busy` or `tooltip`.

## Constraints

- **Follow the package's runner rather than designing a second one.** A repository with two
  unrelated component runners has two things to keep working and no rule for which a new test
  belongs to.

## Notes

Found while building #779, raised rather than taken because that ticket's constraint was no edit
beyond the direction read and the specifier substitution. Raised as #794.

`useDesignContract` in `@rentable/design/strings.js` throws
`a @rentable/design component rendered outside DesignProvider`, which is a good message to
assert on.

**The throw fires at different times depending on the family.** Eight of the ten families that
crossed at #779 read the contract inside a `*-Content` that bits-ui instantiates only when the
overlay opens, so a missing provider surfaces on the first interaction rather than at render. On
this screen the tooltip root's own throw comes first, so a render-time test is enough here. It is
worth knowing before writing the assertion, and the spec lists the other eight as out of scope.

The `tooltip={false}` guard is the newer of the two: `tooltip` became a packaged family at #779,
so before that it was a locale read that degraded silently rather than a context read that
throws.
