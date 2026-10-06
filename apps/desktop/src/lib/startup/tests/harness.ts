import { createStartup, type StartupPorts, type StartupSnapshot } from '$lib/startup/startup.ts';
import type { StartupStage } from '$lib/startup/stage.ts';
import { fakeOrganizationState } from '$lib/organization/tests/testing.ts';
import { fakeSyncState } from '$lib/sync/tests/testing.ts';
import type { RemoteSyncState } from '$lib/sync/host.ts';
import type { Recovery } from '$lib/update/host.ts';
import type { OrganizationState } from '$lib/organization/host.ts';
import { inverseStack } from '$lib/undo/undo.ts';

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
/** a machine that holds nothing. */
export const nowhereToGo = (): OrganizationState => ({
	organizations: [],
	selected: null,
	session: null,
	holdsTursoAuthority: false,
	setupConsented: false,
	signedOutElsewhere: false
});
/** a machine whose person is admitted to an organization with no workspace in it yet. */
export const withoutWorkspace = () =>
	fakeOrganizationState({
		session: { ...fakeOrganizationState().session!, workspaces: [] }
	});

/**
 * Leave the session's real stack holding a change in each direction: two recorded, and the newer
 * taken back, so undo and redo both have something to move. A test pairs it with
 * `forgetUndo: forgetRealUndo`, so the port the unit calls empties this same stack.
 */
export async function holdUndoInBothDirections() {
	const change = (name: string) => ({
		describe: () => name,
		flags: { undo: [], redo: [] },
		undo: async () => undefined,
		redo: async () => undefined
	});

	inverseStack.clear();
	inverseStack.record(change('adding a tenant'));
	inverseStack.record(change('deleting a tenant'));
	await inverseStack.undo();
}

/** whatever the session could still undo and redo, `null` in each where nothing. */
export const heldUndo = () => ({
	undoable: inverseStack.undoable,
	redoable: inverseStack.redoable
});

/** what a test holding the real stack hands the harness as `forgetUndo`. */
export const forgetRealUndo = () => inverseStack.clear();

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
	/** how many times the queries nothing was drawing were dropped, which a switch does once. */
	undrawnDropped: number;
	/** how many times every query was invalidated, which a switch does once. */
	invalidatedAll: number;
	/** how many times the rail was told its sync record is stale, which a sync outcome does. */
	remoteSyncInvalidated: number;
	/** every state the rail's query was seeded with, in order. */
	remembered: RemoteSyncState[];
	contextsForgotten: number;
	/** how many times every change the session could undo or redo was forgotten. */
	undoForgotten: number;
	/** how many times what is drawn from the organization was told it is stale. */
	organizationInvalidated: number;
	/** the organizations the shell was told to choose at the switcher, in order. */
	selected: string[];
	/** the organizations the shell was told to forget, in order. */
	removed: string[];
	/** how many times the shell was told to sign out. */
	signedOut: number;
	failures: string[];
	localesLoaded: string[];
	localeSet: string | null;
	/** the appearance last applied, `null` before any was. */
	appearance: string | null;
	/** the appearance that had been applied at each showing of the window, in order. */
	shownIn: (string | null)[];
	/** the workspaces the unit asked the shell to open, in order. */
	workspacesOpened: string[];
	/**
	 * where the member stands after a dispatch: `signedOutElsewhere` is a session ended from
	 * another machine, and the dispatch signs the member out as Rust does.
	 */
	standing: 'held' | 'signedOutElsewhere';
};

export type Harness = {
	startup: ReturnType<typeof createStartup>;
	journal: Journal;
	/** the snapshot after every change, so a test can say what the reader saw on the way. */
	seen: StartupSnapshot[];
	now: { value: number };
	/** change where the machine stands from here on, as another machine's write would. */
	standWith: (next: OrganizationState) => void;
};

/**
 * A startup with a window that opens, an organization that answers, and a workspace that works.
 *
 * Every override is a way for one of those to be otherwise, which is what each path below is.
 */
export function harness(
	overrides: {
		sync?: RemoteSyncState;
		/** where the machine stands with organizations; unlocked with a workspace unless said. */
		organization?: OrganizationState;
		/** what the organization state answers after the bootstrap, where that differs. */
		afterBootstrap?: OrganizationState;
		bootstrap?: () => Promise<Recovery>;
		settings?: () => Promise<{ locale?: string | null; appearance?: string | null }>;
		/** what loading a locale does, for the paths where the dictionary is what fails. */
		loadLocale?: (locale: string) => Promise<void>;
		/** what a username and password do: the state it leaves the machine in, or the refusal. */
		signInWith?: (username: string, password: string) => Promise<OrganizationState>;
		/** what opening a workspace meets, for the path where the shell refuses to. */
		openWorkspace?: (workspaceId: string) => Promise<void>;
		/** what choosing an organization meets, for the path where the shell refuses to. */
		select?: (organizationId: string) => Promise<void>;
		/** what forgetting an organization meets, for the path where the shell refuses to. */
		remove?: (organizationId: string) => Promise<void>;
		/** what the forget meets once it has happened, for the path where the shell refuses late. */
		afterRemove?: (organizationId: string) => Promise<void>;
		/** what a whole-table reconcile waits on, for the path where two overlap. */
		reconcile?: () => Promise<void>;
		/** what else forgetting the held context does, for a test holding a real one. */
		forgetContext?: () => void;
		/** what else forgetting every change to undo does, for a test holding the real stack. */
		forgetUndo?: () => void;
		/** what else dropping the undrawn queries does, for a test asking what was on screen. */
		dropUndrawn?: () => void;
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
		undrawnDropped: 0,
		invalidatedAll: 0,
		standing: 'held',
		remoteSyncInvalidated: 0,
		remembered: [],
		contextsForgotten: 0,
		undoForgotten: 0,
		organizationInvalidated: 0,
		selected: [],
		removed: [],
		signedOut: 0,
		failures: [],
		localesLoaded: [],
		localeSet: null,
		appearance: null,
		shownIn: [],
		workspacesOpened: []
	};
	const seen: StartupSnapshot[] = [];
	const now = { value: AT };

	// what `sync.getState` answers with, which the unit reads at the account stage, again
	// after the bootstrap, and after a sync manager reports. Opening a workspace records it as the
	// current one, because that is what the shell does before it opens the replica.
	let state = overrides.sync ?? syncing();
	// what `organization.getState` answers with, which is what the wall admits on. The second read
	// is the one after the bootstrap, which is allowed to answer differently.
	let organization = overrides.organization ?? unlocked();
	let organizationReads = 0;

	const ports: StartupPorts = {
		window: {
			show: async () => {
				journal.shown += 1;
				journal.shownIn.push(journal.appearance);
			},
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
		appearance: {
			apply: (setting) => void (journal.appearance = setting ?? 'system')
		},
		sync: {
			getState: async () => state
		},
		organization: {
			getState: async () => {
				organizationReads += 1;

				return organizationReads >= 2 && overrides.afterBootstrap
					? overrides.afterBootstrap
					: organization;
			},
			// what this answers with becomes what the world holds, because that is what it does:
			// Rust updates what it holds, and the next `getState` reads the result.
			signIn: async (username, password) => {
				organization = await (overrides.signInWith ?? (async () => unlocked()))(username, password);

				return organization;
			},
			signOut: async () => {
				journal.signedOut += 1;
				organization = { ...organization, session: null };

				return organization;
			},
			// the choice is the record's, so the next `getState` reads it; refused, as Rust is, while
			// somebody is signed in.
			select: async (organizationId) => {
				journal.selected.push(organizationId);
				await overrides.select?.(organizationId);

				if (organization.session) {
					throw new Error('sign out before choosing another organization');
				}

				organization = { ...organization, selected: organizationId, signedOutElsewhere: false };

				return organization;
			},
			// the forget leaves the machine without that organization, signed out of it where it was
			// the open one, and the selection on the first left or on none, as Rust does.
			remove: async (organizationId) => {
				journal.removed.push(organizationId);
				await overrides.remove?.(organizationId);

				const organizations = organization.organizations.filter(
					(held) => held.id !== organizationId
				);
				const wasOpen = organization.session?.organizationId === organizationId;
				const selected =
					organization.selected === organizationId
						? (organizations[0]?.id ?? null)
						: organization.selected;

				organization = {
					...organization,
					organizations,
					selected,
					session: wasOpen ? null : organization.session
				};

				if (organizations.length === 0) {
					state = syncing();
				}

				await overrides.afterRemove?.(organizationId);

				return organization;
			},
			renewDue: async () => false,
			openWorkspace: async (workspaceId) => {
				journal.workspacesOpened.push(workspaceId);
				await overrides.openWorkspace?.(workspaceId);
				state = { ...state, workspace: { ...state.workspace, remoteId: workspaceId } };
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
				await overrides.reconcile?.();

				return { reconciledAt: now.value };
			},
			syncNow: async (given) => {
				journal.synced += 1;

				// the dispatch is what signs the member out on the Rust side, so the next read
				// of where the machine stands finds nobody in.
				if (journal.standing === 'signedOutElsewhere') {
					organization = { ...organization, session: null, signedOutElsewhere: true };
				}

				return { state: given ?? state, standing: journal.standing };
			},
			syncBeforeExit: async (given) => {
				journal.syncedBeforeExit += 1;
				journal.sequence.push('sync');

				return { state: given ?? state };
			},
			announceReceived: async () => {
				journal.announced += 1;
				await overrides.reconcile?.();

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
			dropUndrawn: () => {
				journal.undrawnDropped += 1;
				overrides.dropUndrawn?.();
			},
			rememberRemoteSync: (remembered) => void journal.remembered.push(remembered),
			invalidateRemoteSync: async () => void journal.remoteSyncInvalidated++,
			invalidateAll: async () => void journal.invalidatedAll++,
			invalidateOrganization: async () => void journal.organizationInvalidated++,
			forgetContext: () => {
				journal.contextsForgotten += 1;
				overrides.forgetContext?.();
			}
		},
		undo: {
			forget: () => {
				journal.undoForgotten += 1;
				overrides.forgetUndo?.();
			}
		},
		describeError: (error) => (error instanceof Error ? error.message : String(error)),
		detailError: () => null,
		recordFailure: (message) => void journal.failures.push(message),
		reportStage: (stage) => void journal.stages.push(stage),
		reportComplete: () => void journal.completed++,
		now: () => now.value
	};

	const startup = createStartup(ports);
	startup.observe((snapshot) => seen.push(snapshot));

	return {
		startup,
		journal,
		seen,
		now,
		standWith: (next) => {
			organization = next;
		}
	};
}
