// Runs before every component test file. It is scaffolding rather than a test, which is why it
// carries no `.test` in its name and why `vitest.config.js` has to name it explicitly.
//
// **What it exists for: bits-ui restores the body style on a timer, and the timer can outlive the
// DOM.** A component that locks body scroll (a dialog, a sheet, the command dialog, and the
// blocks built on them) schedules the restore rather than running it on unmount:
//
//     cleanupTimeoutId = window.setTimeout(cleanupFn, actualDelay);   // 24ms by default
//     bits-ui/dist/internal/body-scroll-lock.svelte.js:75
//
// `@testing-library/svelte` unmounts in its own `afterEach`, so the last test in a file schedules
// that timer and the file then ends. If Vitest tears the jsdom environment down inside those 24ms,
// `cleanupFn` reaches a `document` that is gone:
//
//     ReferenceError: document is not defined
//      ❯ Proxy.resetBodyStyle bits-ui/dist/internal/body-scroll-lock.svelte.js:34:9
//      ❯ Timeout.cleanupFn [as _onTimeout] body-scroll-lock.svelte.js:69:17
//
// Vitest reports that as an unhandled error and **fails the run with every test passing**, which
// is what makes it worth a file rather than a footnote: the summary reads `44 passed` beside
// `2 errors` and the process exits 1. It is a race, so it moves. Measured on 2026-08-23 across
// three CI runs of the same suite: one error from `command.svelte.test.ts`, two from
// `delete-dialog` and `selection-dialog`, and none at all. A green run proves nothing.
//
// `afterAll` rather than `afterEach` is deliberate. Only the *last* unmount in a file races the
// teardown; every earlier timer fires harmlessly during the test that follows it. So this waits
// once per file instead of once per test, and it waits after `@testing-library/svelte`'s cleanup
// whatever order the hooks were registered in, which an `afterEach` here would not guarantee.
import { afterAll } from 'vitest';

// Twice the 24ms bits-ui waits. The margin is free: fourteen files pay 50ms each.
const RESTORE_SCROLL_DELAY = 50;

afterAll(async () => {
	await new Promise((resolve) => setTimeout(resolve, RESTORE_SCROLL_DELAY));
});
