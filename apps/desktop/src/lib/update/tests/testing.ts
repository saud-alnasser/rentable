// Shared fixtures for the updater's port. Not a `*.test.ts` file, so the test runner does not pick
// it up directly. `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { UpdateHost } from '$lib/update/host.ts';

/** The updater's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeUpdateHost(): UpdateHost {
	return {
		prepare: refuse('update.prepare'),
		check: refuse('update.check')
	};
}
