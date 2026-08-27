// Runs before every component test file here, and it is the package's `src/tests/setup.ts` for the
// same reason: bits-ui restores the body style on a 24ms timer that can outlive the DOM, and a
// component this application draws through a packaged dialog, sheet or command palette schedules
// that timer on unmount. If Vitest tears jsdom down first, `cleanupFn` reaches a `document` that is
// gone, Vitest reports it as an unhandled error, and the run exits 1 with every test passing.
//
// `packages/design/src/tests/setup.ts` carries the measurement and the stack trace. This file
// exists rather than importing that one because the package does not export its scaffolding: the
// `exports` map covers `src/lib/` alone, which is what keeps a fixture out of every consumer.
//
// It is scaffolding rather than a test, which is why it carries no `.test` in its name and why
// `vitest.config.js` has to name it explicitly.
import { afterAll } from 'vitest';

// Twice the 24ms bits-ui waits.
const RESTORE_SCROLL_DELAY = 50;

afterAll(async () => {
	await new Promise((resolve) => setTimeout(resolve, RESTORE_SCROLL_DELAY));
});
