// Shared fixtures for remote sync's port: a port refusing every member by name, and the payloads
// it speaks in. Not a `*.test.ts` file, so the test runner does not pick it up directly.
// `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { RemoteSyncState, RemoteSyncWorkspace, SyncHost } from '$lib/sync/host.ts';

/** A workspace as the store holds one. */
export function fakeWorkspace(overrides: Partial<RemoteSyncWorkspace> = {}): RemoteSyncWorkspace {
	return {
		remoteId: null,
		id: 'workspace',
		name: 'Workspace',
		localDatabasePath: 'C:/rentable/app.db',
		permissions: 0,
		lastError: null,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

/** What `sync.getState` answers with. */
export function fakeSyncState(overrides: Partial<RemoteSyncState> = {}): RemoteSyncState {
	return {
		workspace: fakeWorkspace(),
		startupPromptEnabled: false,
		deviceId: 'device',
		accountRefusal: null,
		credentialRefusal: null,
		unsendableChanges: null,
		lastReachedAt: null,
		...overrides
	};
}

/** Remote sync's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeSyncHost(): SyncHost {
	return {
		getState: refuse('sync.getState'),
		replicate: refuse('sync.replicate'),
		push: refuse('sync.push'),
		renameWorkspace: refuse('sync.renameWorkspace'),
		discardUnsent: refuse('sync.discardUnsent')
	};
}
