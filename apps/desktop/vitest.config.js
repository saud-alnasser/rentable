// The runner for this application's component tests, and it follows
// `packages/design/vitest.config.js` rather than being designed fresh: same environment, same
// `globals`, same `.svelte.test.ts` collection. `[[rules/testing]]` under *Component tests*
// governs which runner a new test belongs to, and the split is the same one the package makes.
//
// **`sveltekit()` rather than `svelte()`, and that is the one deliberate difference.** The package
// names its own files with subpath imports and needs the compiler and nothing else. This
// application is a SvelteKit project: a component here reaches `$lib/...` and `$app/...`, and the
// framework plugin is what resolves both. Reaching for the bare Svelte plugin and adding two
// aliases by hand would be a second, worse copy of what `svelte-kit sync` already generates.
//
// It is not `vite.config.js` wearing another name either. That file carries the dev server, the
// Tauri port and Tailwind; nothing here produces output, and the only consumer is `vitest run`.
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Under a test run the browser entry point is the right one, for the reason the package's
	// config states at more length: svelte's `exports` map sends `browser` to `index-client.js` and
	// everything else to `index-server.js`, and `mount` raises `Svelte error` from the server
	// build. The ternary keeps the condition scoped to the test run.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		// on for the same reason it is on in the package: `@testing-library/svelte` registers its
		// hooks only when it finds `beforeEach` and `afterEach` as globals, and the first of them is
		// what calls its `setup()`. Tests still import `test` and `expect` explicitly.
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/tests/setup.ts'],
		// **`.svelte.test.ts`, and the segment is what keeps the two runners apart.** The `test`
		// script hands `node:test` an extglob that excludes exactly this shape. A `node:test` file
		// collected here does not fail cleanly: it reports `No test suite found in file` and a
		// summary that omits the assertion that failed.
		include: ['src/**/*.svelte.test.ts']
	}
});
