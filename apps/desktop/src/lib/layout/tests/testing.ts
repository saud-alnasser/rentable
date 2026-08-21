import { createStartup, type StartupPorts, type StartupSnapshot } from '$lib/layout/startup.ts';
import type { StartupStage } from '$lib/layout/startup-stage.ts';
import { fakeAccount, fakeSyncState } from '$lib/platform/tests/testing.ts';
import type { Recovery, RemoteSyncState } from '$lib/platform/host.ts';

/**
 * Shared harness for driving startup with no window.
 *
 * A startup with a window that opens, a control plane that answers and a workspace that works;
 * every override is a way for one of those to be otherwise, which is what each path is. Not a
 * `*.test.ts` file, so the runner does not pick it up directly.
 *
 * Here rather than in one test file because two of them drive it: the eight paths, and the check
 * that every stage the loading screen names is one this path actually reports.
 */

export const AT = Date.UTC(2026, 7, 20, 12);
export const A_DAY = 24 * 60 * 60 * 1000;

export const signedIn = () => fakeSyncState({ accounts: [fakeAccount()] });
export const signedOut = () => fakeSyncState();
/** an account, a control plane to reach, and no session: the wall that offers the call again. */
export const withoutSession = () =>
	fakeSyncState({ accounts: [fakeAccount()], controlPlaneReady: true, session: null });

export function fakeRecovery(overrides: Partial<Recovery> = {}): Recovery {
	return {
		targetVersion: '',
		previousVersion: '',
		updateError: null,
		status: 'obsolete',
		previousReleaseUrl: '',
		...overrides
	};
}

/** every call the unit made that a test might ask about, in the order it made them. */
export type Journal = {
	stages: StartupStage[];
	/** what the window and the sync did, in the order they did it. */
	sequence: string[];
	completed: number;
	shown: number;
	hidden: number;
	closed: number;
	bootstrapped: number;
	reconciled: number;
	synced: number;
	syncedBeforeExit: number;
	cacheCleared: number;
	contextsForgotten: number;
	failures: string[];
	sessionsExpired: number;
	localesLoaded: string[];
	localeSet: string | null;
};

export type Harness = {
	startup: ReturnType<typeof createStartup>;
	journal: Journal;
	/** the snapshot after every change, so a test can say what the reader saw on the way. */
	seen: StartupSnapshot[];
	now: { value: number };
};

/**
 * A startup with a window that opens, a control plane that answers, and a workspace that works.
 *
 * Every override is a way for one of those to be otherwise, which is what each path below is.
 */
export function harness(
	overrides: {
		remoteSync?: RemoteSyncState;
		afterBootstrap?: RemoteSyncState;
		bootstrap?: () => Promise<Recovery>;
		settings?: () => Promise<{ locale?: string | null }>;
		/** what loading a locale does, for the paths where the dictionary is what fails. */
		loadLocale?: (locale: string) => Promise<void>;
		signInWith?: () => Promise<RemoteSyncState>;
		establishSession?: () => Promise<RemoteSyncState>;
		isCancellation?: (error: unknown) => boolean;
	} = {}
): Harness {
	const journal: Journal = {
		stages: [],
		sequence: [],
		completed: 0,
		shown: 0,
		hidden: 0,
		closed: 0,
		bootstrapped: 0,
		reconciled: 0,
		synced: 0,
		syncedBeforeExit: 0,
		cacheCleared: 0,
		contextsForgotten: 0,
		failures: [],
		sessionsExpired: 0,
		localesLoaded: [],
		localeSet: null
	};
	const seen: StartupSnapshot[] = [];
	const now = { value: AT };

	// what `remoteSync.getState` answers with, which the unit reads more than once: at the account
	// stage, again after the bootstrap, and after a sync manager reports.
	let state = overrides.remoteSync ?? signedIn();
	let readCount = 0;

	const ports: StartupPorts = {
		window: {
			show: async () => void journal.shown++,
			hide: async () => {
				journal.hidden += 1;
				journal.sequence.push('hide');
			},
			close: async () => {
				journal.closed += 1;
				journal.sequence.push('close');
			}
		},
		settings: overrides.settings
			? { get: overrides.settings }
			: { get: async () => ({ locale: 'en' }) },
		remoteSync: {
			getState: async () => {
				readCount += 1;

				// the second read is the one after the bootstrap, which is allowed to answer
				// differently: minting is what learns this account left the workspace.
				return readCount >= 2 && overrides.afterBootstrap ? overrides.afterBootstrap : state;
			},
			// what these two answer with becomes what the world holds, because that is what they do:
			// Rust updates its state store, and the next `getState` reads the result.
			establishSession: async () => {
				state = await (overrides.establishSession ?? (async () => signedIn()))();

				return state;
			}
		},
		auth: { onPhase: async () => () => {} },
		workspace: {
			bootstrap:
				overrides.bootstrap ??
				(async () => {
					journal.bootstrapped += 1;

					return fakeRecovery();
				}),
			reconcile: async () => {
				journal.reconciled += 1;

				return { reconciledAt: now.value };
			},
			syncNow: async (given) => {
				journal.synced += 1;

				return { state: given ?? state };
			},
			syncBeforeExit: async (given) => {
				journal.syncedBeforeExit += 1;
				journal.sequence.push('sync');

				return { state: given ?? state };
			},
			announceReceived: async () => now.value
		},
		signIn: {
			withGoogle: async () => {
				state = await (overrides.signInWith ?? (async () => signedIn()))();

				return state;
			},
			isCancellation: overrides.isCancellation ?? (() => false)
		},
		locale: {
			load: async (locale) => {
				journal.localesLoaded.push(locale);

				await overrides.loadLocale?.(locale);
			},
			set: (locale) => void (journal.localeSet = locale),
			all: ['en', 'ar'],
			base: 'en'
		},
		cache: {
			clear: () => void journal.cacheCleared++,
			rememberRemoteSync: () => {},
			invalidateRemoteSync: async () => {},
			invalidateAll: async () => {},
			forgetContext: () => void journal.contextsForgotten++
		},
		describeError: (error) => (error instanceof Error ? error.message : String(error)),
		onSessionExpired: () => void journal.sessionsExpired++,
		recordFailure: (message) => void journal.failures.push(message),
		reportStage: (stage) => void journal.stages.push(stage),
		reportComplete: () => void journal.completed++,
		now: () => now.value
	};

	const startup = createStartup(ports);
	startup.observe((snapshot) => seen.push(snapshot));

	return { startup, journal, seen, now };
}
