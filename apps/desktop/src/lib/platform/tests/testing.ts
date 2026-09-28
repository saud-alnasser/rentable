// Shared fixtures for the desktop shell's platform port: a host implementing the whole of it, and
// the payloads it speaks in. Not a `*.test.ts` file, so the test runner does not pick it up
// directly.
//
// They live here rather than beside each caller because the port is one declaration and its
// payloads have no optional fields: a fixture holding the two members a subject happens to read
// is a shape the shell never produces, and every test that wrote one out by hand wrote a
// different one.
//
// A feature's port has fixtures of its own beside it (`organization/tests/testing.ts`), and
// `app/tests/host.ts` composes them with this into the whole `Host` a context is handed.

import type {
	PlatformHost,
	RemoteSyncState,
	RemoteSyncWorkspace,
	Settings
} from '$lib/platform/host.ts';

/** The settings a fake shell reports, with only what a test cares about spelled out. */
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		endingSoonNoticeDays: 60,
		databasePath: 'C:/rentable/app.db',
		diagnosticsDir: 'C:/rentable/diagnostics',
		locale: 'en',
		appearance: 'system',
		version: '0.0.0-test',
		earlierRecordsSettled: false,
		...overrides
	};
}

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

/** What `remoteSync.getState` answers with. */
export function fakeSyncState(overrides: Partial<RemoteSyncState> = {}): RemoteSyncState {
	return {
		workspace: fakeWorkspace(),
		startupPromptEnabled: false,
		deviceId: 'device',
		accountRefusal: null,
		credentialRefusal: null,
		lastReachedAt: null,
		...overrides
	};
}

/**
 * a member of a fake port that refuses by name, saying which capability a test reached for and
 * did not supply. Every fake port builds its members from it.
 */
export function refuse(capability: string): () => never {
	return () => {
		throw new Error(`the fake host was asked for ${capability}, which this test did not supply`);
	};
}

/**
 * The platform's part of a host, implementing the whole of it, so a fixture satisfies the
 * interface a subject is handed rather than the corner of it that subject happens to read.
 *
 * Every capability a test does not supply refuses by name. That is what the partial object
 * literals here did already — reaching one of them threw a `TypeError` about `undefined` —
 * except that this one says which capability was wanted, and the compiler can see the whole
 * surface rather than the two members that happened to be written out.
 *
 * `overrides` replaces a capability whole, never a member of one: a half-supplied `settings` is
 * the same hole this exists to close.
 */
export function fakePlatformHost(overrides: Partial<PlatformHost> = {}): PlatformHost {
	const settings = fakeSettings();

	return {
		bootstrap: refuse('bootstrap'),
		window: {
			show: refuse('window.show'),
			hide: refuse('window.hide'),
			minimize: refuse('window.minimize'),
			maximize: refuse('window.maximize'),
			drag: refuse('window.drag'),
			close: refuse('window.close'),
			restart: refuse('window.restart')
		},
		opener: {
			openUrl: refuse('opener.openUrl'),
			revealItemInDir: refuse('opener.revealItemInDir')
		},
		print: {
			page: refuse('print.page')
		},
		export: {
			write: refuse('export.write'),
			writeWorkbook: refuse('export.writeWorkbook')
		},
		import: {
			read: refuse('import.read'),
			readBook: refuse('import.readBook')
		},
		earlier: {
			find: refuse('earlier.find'),
			read: refuse('earlier.read')
		},
		dialog: {
			openFile: refuse('dialog.openFile'),
			openImage: refuse('dialog.openImage'),
			saveFile: refuse('dialog.saveFile')
		},
		diagnostics: {
			write: refuse('diagnostics.write')
		},
		update: {
			prepare: refuse('update.prepare'),
			check: refuse('update.check')
		},
		settings: {
			get: async () => settings,
			// what the shell does with a changeset: a member it names is written, and one it leaves
			// out keeps what it was.
			set: async (changeset) => {
				for (const [key, value] of Object.entries(changeset)) {
					if (value !== undefined) Object.assign(settings, { [key]: value });
				}

				return settings;
			}
		},
		remoteSync: {
			getState: refuse('remoteSync.getState'),
			replicate: refuse('remoteSync.replicate'),
			push: refuse('remoteSync.push'),
			renameWorkspace: refuse('remoteSync.renameWorkspace')
		},
		...overrides
	};
}
