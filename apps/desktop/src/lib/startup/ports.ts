import type { RemoteSyncState } from '$lib/sync';
import type { Recovery } from '$lib/update';
import type { OrganizationState } from '$lib/organization';
import type { StartupStage } from './stage';

/**
 * What startup reaches for outside itself.
 *
 * Grouped by the thing being reached rather than by the call, so a fake supplies a window or an
 * organization rather than eleven unrelated functions.
 */
export type StartupPorts = {
	window: {
		show(): Promise<unknown>;
		hide(): Promise<unknown>;
		close(): Promise<unknown>;
	};
	/**
	 * the shell's own settings, read off the host: they carry the locale the wall is drawn in and
	 * the appearance every screen is drawn in.
	 */
	settings: { get(): Promise<{ locale?: string | null; appearance?: string | null }> };
	/**
	 * light, dark or following the system, drawn at once. What it is handed is the stored value
	 * as it came off the file, and anything it does not recognise is system.
	 */
	appearance: { apply(setting: string | null | undefined): void };
	sync: {
		getState(): Promise<RemoteSyncState>;
	};
	/** the organization this machine holds, and the vault a username and password open. */
	organization: {
		getState(): Promise<OrganizationState>;
		/** sign in to the held organization by username and password; one sentence for a refusal. */
		signIn(username: string, password: string): Promise<OrganizationState>;
		signOut(): Promise<OrganizationState>;
		/**
		 * forget the held organization on this machine: every replica, the record, the Turso
		 * authority. The one confirm before it is the screen's.
		 */
		disconnect(): Promise<OrganizationState>;
		/** open one of the workspaces the session holds a grant on, before the bootstrap. */
		openWorkspace(workspaceId: string): Promise<unknown>;
		/** renew credentials close to lapsing, on the owner's machine, best effort. */
		renewDue(): Promise<boolean>;
	};
	workspace: {
		bootstrap(): Promise<Recovery>;
		reconcile(): Promise<{ reconciledAt: number }>;
		/**
		 * push and pull, and say where the member stands after it: `signedOutElsewhere` is a
		 * session ended from another machine, learned at this pull, and the shell has already
		 * signed the member out on its side (effort 826, requirement 22).
		 */
		syncNow(
			state: RemoteSyncState | null
		): Promise<{ state: RemoteSyncState; standing?: 'held' | 'signedOutElsewhere' }>;
		syncBeforeExit(state: RemoteSyncState | null): Promise<{ state: RemoteSyncState }>;
		/** a pull landed rows; announce them and say the day they were reconciled on. */
		announceReceived(): Promise<number>;
	};
	locale: {
		load(locale: string): Promise<void>;
		set(locale: string): void;
		/** every locale, so the settings page can switch without awaiting a load. */
		all: readonly string[];
		base: string;
	};
	cache: {
		/** everything drawn for whoever was here before. */
		clear(): void;
		/**
		 * every query nothing is drawing any more, and none that something is.
		 *
		 * What a switch between workspaces asks for, and `clear` is not it: a query removed from
		 * the cache is never heard from again by whatever was drawing it, and the rail stays on
		 * screen through a switch. The page's queries have no observer once the loading surface
		 * replaced it, so they go; the rail's are refetched through `invalidateAll` instead.
		 */
		dropUndrawn(): void;
		rememberRemoteSync(state: RemoteSyncState): void;
		invalidateRemoteSync(): Promise<unknown>;
		invalidateAll(): Promise<unknown>;
		/** everything drawn from the organization: its state, its members, its roles. */
		invalidateOrganization(): Promise<unknown>;
		/**
		 * the held API context names an account and what it may do in the workspace open; drop it
		 * when either stops being true.
		 */
		forgetContext(): void;
	};
	/** a thrown value as a reader should see it. The route's translations, from outside. */
	describeError(error: unknown): string;
	/** what the shell said behind a thrown value, kept for a disclosure; `null` where nothing. */
	detailError(error: unknown): string | null;
	recordFailure(message: string, detail: string | null): void;
	reportStage(stage: StartupStage): void;
	reportComplete(): void;
	now(): number;
};
