// Shared fixtures for printing's port. Not a `*.test.ts` file, so the test runner does not pick it
// up directly. `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { PrintHost } from '$lib/print/host.ts';

/** Printing's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakePrintHost(): PrintHost {
	return {
		page: refuse('print.page')
	};
}
