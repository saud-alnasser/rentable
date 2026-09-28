// Shared fixtures for startup's port. Not a `*.test.ts` file, so the test runner does not pick it
// up directly. `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { StartupHost } from '$lib/startup/host.ts';

/** Startup's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeStartupHost(): StartupHost {
	return {
		bootstrap: refuse('startup.bootstrap')
	};
}
