import { createStartup, type StartupPorts, type StartupSnapshot } from '$lib/layout/startup.ts';
import type { StartupStage } from '$lib/layout/startup-stage.ts';
import { fakeOrganizationState, fakeSyncState } from '$lib/platform/tests/testing.ts';
import type { OrganizationState, Recovery, RemoteSyncState } from '$lib/platform/host.ts';

/**
 * Shared harness for driving startup with no window.
 *
 * A startup with a window that opens, an organization that answers and a workspace that works;
 * every override is a way for one of those to be otherwise, which is what each path is. Not a
 * `*.test.ts` file, so the runner does not pick it up directly.
 *
 * Here rather than in one test file because two of them drive it: the eight paths, and the check
 * that every stage the loading screen names is one this path actually reports.
 */

export const AT = Date.UTC(2026, 7, 20, 12);
export const A_DAY = 24 * 60 * 60 * 1000;

/** the machine's own sync record: which workspace is open, and nothing about who is in. */
export const syncing = () => fakeSyncState();

/** a machine that has joined an organization and whose person's vault is open, with a workspace. */
export const unlocked = () => fakeOrganizationState();
/** a machine that has joined an organization and holds no open vault. */
export const locked = () => fakeOrganizationState({ session: null });
/** a machine that has joined nothing. */
export const nowhereToGo = (): OrganizationState => ({
	organizations: [],
	session: null,
	holdsTursoAuthority: false
});
/** a machine whose person is in on a password somebody else drew, and has to choose their own. */
export const mustChangePassword = () =>
	fakeOrganizationState({
		session: { ...fakeOrganizationState().session!, mustChangePassword: true }
	});
/** a machine whose person is admitted to an organization with no workspace in it yet. */
export const withoutWorkspace = () =>
	fakeOrganizationState({
		session: { ...fakeOrganizationState().session!, workspaces: [] }
	});

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
	/** how many pulls that brought rows were announced. */
	announced: number;
	synced: number;
	syncedBeforeExit: number;
	cacheCleared: number;
	contextsForgotten: number;
	failures: string[];
	localesLoaded: string[];
	localeSet: string | null;
	/** the workspaces the unit asked the shell to open, in order. */
	workspacesOpened: string[];
};

export type Harness = {
	startup: ReturnType<typeof createStartup>;
	journal: Journal;
	/** the snapshot after every change, so a test can say what the reader saw on the way. */
	seen: StartupSnapshot[];
	now: { value: number };
};

/**
 * A startup with a window that opens, an organization that answers, and a workspace that works.
 *
 * Every override is a way for one of those to be otherwise, which is what each path below is.
 */
export function harness(
	overrides: {
		remoteSync?: RemoteSyncState;
		/** where the machine stands with organizations; unlocked with a workspace unless said. */
		organization?: OrganizationState;
		/** what the organization state answers after the bootstrap, where that differs. */
		afterBootstrap?: OrganizationState;
		bootstrap?: () => Promise<Recovery>;
		settings?: () => Promise<{ locale?: string | null }>;
		/** what loading a locale does, for the paths where the dictionary is what fails. */
		loadLocale?: (locale: string) => Promise<void>;
		/** what a password does: the state it leaves the machine in, or the refusal it meets. */
		signInWith?: (organizationId: string, password: string) => Promise<OrganizationState>;
		/** what a link and a password do: the state joining leaves the machine in, or the refusal. */
		joinWith?: (link: string, password: string) => Promise<OrganizationState>;
		/** what changing the password does: the state it leaves the machine in, or the refusal. */
		changePasswordWith?: (current: string, next: string) => Promise<OrganizationState>;
		/** what restoring does: the state it leaves the machine in, or the refusal. */
		restoreWith?: (link: string, email: string, password: string) => Promise<OrganizationState>;
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
		announced: 0,
		synced: 0,
		syncedBeforeExit: 0,
		cacheCleared: 0,
		contextsForgotten: 0,
		failures: [],
		localesLoaded: [],
		localeSet: null,
		workspacesOpened: []
	};
	const seen: StartupSnapshot[] = [];
	const now = { value: AT };

	// what `remoteSync.getState` answers with, which the unit reads at the account stage, again
	// after the bootstrap, and after a sync manager reports.
	const state = overrides.remoteSync ?? syncing();
	// what `organization.getState` answers with, which is what the wall admits on. The second read
	// is the one after the bootstrap, which is allowed to answer differently.
	let organization = overrides.organization ?? unlocked();
	let organizationReads = 0;

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
			getState: async () => state
		},
		organization: {
			getState: async () => {
				organizationReads += 1;

				return organizationReads >= 2 && overrides.afterBootstrap
					? overrides.afterBootstrap
					: organization;
			},
			// what these two answer with becomes what the world holds, because that is what they
			// do: Rust updates what it holds, and the next `getState` reads the result.
			signIn: async (organizationId, password) => {
				organization = await (overrides.signInWith ?? (async () => unlocked()))(
					organizationId,
					password
				);

				return organization;
			},
			join: async (link, password) => {
				organization = await (overrides.joinWith ?? (async () => unlocked()))(link, password);

				return organization;
			},
			restore: async (link, email, password) => {
				organization = await (overrides.restoreWith ?? (async () => unlocked()))(
					link,
					email,
					password
				);

				return organization;
			},
			changePassword: async (current, next) => {
				organization = await (overrides.changePasswordWith ?? (async () => unlocked()))(
					current,
					next
				);

				return organization;
			},
			signOut: async () => {
				organization = { ...organization, session: null };

				return organization;
			},
			renewDue: async () => false,
			openWorkspace: async (workspaceId) => {
				journal.workspacesOpened.push(workspaceId);
			}
		},
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
			announceReceived: async () => {
				journal.announced += 1;

				return now.value;
			}
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
		recordFailure: (message) => void journal.failures.push(message),
		reportStage: (stage) => void journal.stages.push(stage),
		reportComplete: () => void journal.completed++,
		now: () => now.value
	};

	const startup = createStartup(ports);
	startup.observe((snapshot) => seen.push(snapshot));

	return { startup, journal, seen, now };
}
