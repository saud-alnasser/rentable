// Shared fixtures for the desktop shell's port: a host implementing the whole of it, and the
// payloads it speaks in. Not a `*.test.ts` file, so the test runner does not pick it up
// directly.
//
// They live here rather than beside each caller because the port is one declaration and its
// payloads have no optional fields: a fixture holding the two members a subject happens to read
// is a shape the shell never produces, and every test that wrote one out by hand wrote a
// different one.

import type {
	Host,
	RemoteSyncAccount,
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
		version: '0.0.0-test',
		...overrides
	};
}

/** An account as the store holds one: signed in and in good standing. */
export function fakeAccount(overrides: Partial<RemoteSyncAccount> = {}): RemoteSyncAccount {
	return {
		id: 'account',
		status: 'ready',
		email: 'person@example.com',
		displayName: 'Person Example',
		avatarUrl: null,
		providerUserId: null,
		tokenExpiresAt: null,
		refreshTokenAvailable: true,
		lastError: null,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

/** A workspace as the store holds one. */
export function fakeWorkspace(overrides: Partial<RemoteSyncWorkspace> = {}): RemoteSyncWorkspace {
	return {
		id: 'workspace',
		name: 'Workspace',
		localDatabasePath: 'C:/rentable/app.db',
		lastError: null,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

/** What `remoteSync.getState` answers with. */
export function fakeSyncState(overrides: Partial<RemoteSyncState> = {}): RemoteSyncState {
	return {
		accounts: [],
		workspace: fakeWorkspace(),
		startupPromptEnabled: false,
		googleSignInReady: false,
		controlPlaneReady: false,
		session: null,
		deviceId: 'device',
		...overrides
	};
}

function refuse(capability: string): () => never {
	return () => {
		throw new Error(`the fake host was asked for ${capability}, which this test did not supply`);
	};
}

/**
 * A host implementing the whole port, so a fixture satisfies the interface a subject is handed
 * rather than the corner of it that subject happens to read.
 *
 * Every capability a test does not supply refuses by name. That is what the partial object
 * literals here did already — reaching one of them threw a `TypeError` about `undefined` —
 * except that this one says which capability was wanted, and the compiler can see the whole
 * surface rather than the two members that happened to be written out.
 *
 * `overrides` replaces a capability whole, never a member of one: a half-supplied `settings` is
 * the same hole this exists to close.
 */
export function fakeHost(overrides: Partial<Host> = {}): Host {
	const settings = fakeSettings();

	return {
		bootstrap: refuse('bootstrap'),
		auth: {
			google: {
				signIn: refuse('auth.google.signIn'),
				signOut: refuse('auth.google.signOut'),
				onPhase: refuse('auth.google.onPhase')
			}
		},
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
		export: {
			write: refuse('export.write'),
			writeWorkbook: refuse('export.writeWorkbook')
		},
		import: {
			read: refuse('import.read'),
			readBook: refuse('import.readBook')
		},
		dialog: {
			openFile: refuse('dialog.openFile'),
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
			set: async () => settings
		},
		remoteSync: {
			getState: refuse('remoteSync.getState'),
			renewSession: refuse('remoteSync.renewSession')
		},
		...overrides
	};
}
