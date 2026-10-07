// Shared fixtures for the updater's port. Not a `*.test.ts` file, so the test runner does not pick
// it up directly. `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { AvailableUpdate, CheckedUpdate, UpdateHost } from '$lib/update/host.ts';

/** The updater's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeUpdateHost(): UpdateHost {
	return {
		prepare: refuse('update.prepare'),
		check: refuse('update.check'),
		download: refuse('update.download'),
		install: refuse('update.install')
	};
}

/** a release a check found, as the shell describes it. */
export function fakeRelease(overrides: Partial<AvailableUpdate> = {}): CheckedUpdate {
	return {
		outcome: 'available',
		currentVersion: '0.14.0',
		version: '0.15.0',
		date: '2026-10-01T00:00:00Z',
		body: null,
		rawJson: {},
		...overrides
	};
}

/** what a check answers when no newer release exists. */
export const noRelease = (): CheckedUpdate => ({ outcome: 'noRelease' });

/** what a request that never reached the update server throws, as it crosses the boundary. */
export const offline = () => ({ code: 'network', message: 'error sending request for url' });
