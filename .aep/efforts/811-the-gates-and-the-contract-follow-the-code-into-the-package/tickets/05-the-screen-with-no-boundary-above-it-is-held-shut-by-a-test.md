---
status: open
---

# test(desktop): the screen with no boundary above it is held shut by a test rather than by three comments

## Outcome

`apps/desktop` can render a component in a test, and rendering the startup subtree outside its
providers fails one, with a message that names the guard that was dropped.

## Acceptance Criteria

Traces requirement 6 and requirement 7 of the spec, and its criterion 6 and criterion 7.

- [ ] `apps/desktop` can render a component in a test. Today it cannot: `vitest`, `jsdom` and
      `@testing-library/svelte` are configured in `packages/design` only, and the desktop's
      `test` script is `node --import tsx --test` alone. `packages/design/vitest.config.js` and
      its `.svelte.test.ts` convention are the shape to copy, and `[[rules/testing]]` is what
      governs the split.
- [ ] A test renders `startup-unreadable` with no `DesignProvider` and no `TooltipProvider`
      above it, as `+layout.svelte` does, and it passes.
- [ ] Removing `tooltip={false}` from either call site in `startup-unreadable.svelte` makes that
      test fail, and the failure names the provider rather than surfacing as an unrelated render
      error.
- [ ] Giving `StandaloneSurface` a `busy`, or a tone other than `error`, makes it fail the same
      way.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass.

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
