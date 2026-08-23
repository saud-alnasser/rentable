// The runner for component tests. A component only answers the question it exists for once it
// has rendered, so these tests need a DOM and a compiled component, which is what this file
// supplies and what `node:test` cannot: that runner works through `tsx`, and `tsx` fails on a
// `.svelte` import with `ERR_UNKNOWN_FILE_EXTENSION`.
//
// The package has no build, so this is not a `vite.config.js` wearing another name. Nothing here
// produces output; the only consumer is `vitest run`.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte()],
	// Under a test run the browser entry point is the right one, and svelte itself is what makes
	// this load-bearing rather than defensive: its `exports` map sends `browser` to
	// `index-client.js` and everything else to `index-server.js`. Measured on 2026-08-23 by
	// removing this line, which turned both tests into `Svelte error` raised from
	// `svelte/src/index-server.js` inside `mount`. The ternary is what keeps the condition scoped
	// to the test run rather than applied to everything.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		// **On, and not for the convenience.** `@testing-library/svelte` registers `beforeEach`
		// and `afterEach` hooks only when it finds those functions as globals, and the first of
		// them is what calls its `setup()`. Without `setup()` the library's `wrapper` option
		// throws `WrapperNotSetupError` on use, and `wrapper` is how a component that reads its
		// strings from context gets rendered under test at all. Measured on 2026-08-23: off, the
		// wrapper throws; on, it renders. Tests still import `test` and `expect` explicitly, so
		// nothing here depends on a global being in scope.
		globals: true,
		environment: 'jsdom',
		// **Not a test, and not optional.** `src/tests/setup.ts` holds an `afterAll` that lets
		// bits-ui's deferred body-scroll restore run before the DOM is torn down. Without it a
		// suite in which every test passes still exits 1, on whichever file loses the race. The
		// file says which timer and why the hook is `afterAll`.
		setupFiles: ['./src/tests/setup.ts'],
		// **A component test is named `<name>.svelte.test.ts`, and both halves of that earn their
		// place.** The `.svelte.` segment is what lets the file use runes: the same file as
		// `<name>.test.ts` raises `rune_outside_svelte` from `$effect.root()`, and renaming it is
		// the whole fix. And it is what keeps this runner off the `node:test` files that arrive in
		// this package as modules move into it. A plain `<name>.test.ts` collected here does not
		// fail cleanly: measured on 2026-08-23, vitest reported `No test suite found in file` and
		// a summary of `2 passed` that omitted the failing assertion entirely.
		include: ['src/**/*.svelte.test.ts']
	}
});
