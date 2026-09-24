import type { OrganizationState, Recovery, RemoteSyncState } from '$lib/platform/host';
import { organizationAdmission } from '$lib/sync/admission';
import { toUtcDay } from '$lib/api/date';
import type { StartupStage } from './startup-stage';

/**
 * STARTUP
 *
 * everything the application does between the process starting and a person being able to use
 * it, and everything it does about that afterwards: the state machine, the sign-in wall and the
 * ladder in front of it, the session retry, the recovery branch, the day-crossing reconcile, the
 * window close that syncs first, and the sign-out that puts the wall back up.
 *
 * **It lived in `routes/+layout.svelte` and could not be driven without a window.** Seven of its
 * paths could only be checked by launching the application into seven states, two of which need a
 * failing network or a half-finished update, so in practice none of them was checked at all. What
 * this file is for is being driven with no window, the way `sync/admission.ts` already is.
 *
 * **Plain, and not `.svelte.ts`.** A runes file cannot be imported by a `node:test` at all, which
 * is the whole reason the state here is an ordinary object with observers rather than `$state`.
 * The shell subscribes and mirrors it; that mirroring is the only reactive thing left in the
 * route.
 *
 * **Every reach outside itself is a port.** Not for indirection's sake: each one is a thing that
 * is absent in a test process, and naming them is what lets a test say *this launch has no
 * account* rather than mock a global.
 */

/**
 * *`choose-workspace` went with Google Drive sync (decision 07). It offered two things, open the
 * workspace kept on this machine or link a Drive folder, and there is one workspace, created at
 * sign-up, with nothing to choose between.*
 *
 * **`no-workspace` arrived with organizations.** A member is admitted by their password, and what
 * they are admitted to is whichever workspaces they hold a grant on; an organization whose owner
 * has not created one yet admits its members to nothing, which is a state of its own rather than a
 * failure to start. Creating one is the workspace ticket's; this state is where that surface goes.
 */
export type StartupState = 'loading' | 'sign-in' | 'no-workspace' | 'ready' | 'error' | 'recovery';

/**
 * why the wall is up, which is only read while it is. The organization's three reasons, from
 * `sync/admission.ts`; the three that named an account and a session window went with the service
 * that issued them. *The third arrived with effort 826, requirement 22: `locked`, with the
 * sentence for a machine somebody signed out from another one.*
 */
export type SignInReason = 'noOrganization' | 'locked' | 'signedOutElsewhere';

/** everything the shell draws itself from. Read-only to it; only this unit writes. */
export type StartupSnapshot = {
	state: StartupState;
	/** what went wrong, already rendered for a reader. `null` where nothing did. */
	error: string | null;
	recovery: Recovery | null;
	remoteSync: RemoteSyncState | null;
	/** where this machine stands with organizations, which is what the wall admits on. */
	organization: OrganizationState | null;
	signInReason: SignInReason;
	/**
	 * whether the rail has been on screen yet in this run.
	 *
	 * It latches on and is never cleared: what it answers is *has this application been running*,
	 * and a load in the middle of a session does not un-answer that. Failing to start and update
	 * recovery still take the bare frame, because those are states where it stopped.
	 */
	railIsUp: boolean;
	/** whether a locale is loaded, which is what lets anything at all be drawn. */
	isI18nReady: boolean;
	/**
	 * whether a startup has already failed with no locale loaded.
	 *
	 * It latches on and is cleared by nothing but a locale arriving, which is what keeps the screen
	 * drawn for such a failure on screen across a retry. Without it the one control that failure
	 * offers replaces itself with the blank window it was offered from: `start` sets `loading` and
	 * clears the error, and nothing on this side of the gate has anything left to draw.
	 */
	hasFailedUnreadable: boolean;
	/** a password is being tried, which is a key derivation a person is waiting on. */
	isSigningIn: boolean;
};

/** what a sync manager reported, as this unit needs to read it. */
export type SyncOutcome = {
	action: string;
	received: boolean;
	/**
	 * the workspace the dispatch ran for, read before it ran; `null` where none was open.
	 *
	 * A dispatch in flight while a switch happens reports for the workspace that was open when it
	 * started, after the cache has been cleared for the one open now. Without this the report
	 * cannot be told from one about the new workspace, and a `received` outcome would run a
	 * reconcile the new workspace did not need and say rows arrived that a person never saw.
	 */
	workspaceId: string | null;
};

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
	remoteSync: {
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
		/** the held API context names an account; drop it when that stops being true. */
		forgetContext(): void;
	};
	/** a thrown value as a reader should see it. The route's translations, from outside. */
	describeError(error: unknown): string;
	recordFailure(message: string): void;
	reportStage(stage: StartupStage): void;
	reportComplete(): void;
	now(): number;
};

const INITIAL: StartupSnapshot = {
	state: 'loading',
	error: null,
	recovery: null,
	remoteSync: null,
	organization: null,
	signInReason: 'noOrganization',
	railIsUp: false,
	isI18nReady: false,
	hasFailedUnreadable: false,
	isSigningIn: false
};

/**
 * Whether a recovery record says anything at all.
 *
 * A record with every field blank is the absence of a recovery rather than one with nothing to
 * say, and putting the recovery screen up for it would stop an ordinary launch dead.
 */
export function hasRecoveryData(recovery: Recovery | null) {
	if (!recovery) {
		return false;
	}

	return (
		recovery.targetVersion.trim().length > 0 ||
		recovery.previousVersion.trim().length > 0 ||
		recovery.previousReleaseUrl.trim().length > 0 ||
		recovery.updateError !== null
	);
}

export class Startup {
	#ports: StartupPorts;
	#snapshot: StartupSnapshot = { ...INITIAL };
	#observers = new Set<(snapshot: StartupSnapshot) => void>();

	#isSyncingWindowClose = false;
	#isFinalizingWindowClose = false;
	#isReconcilingDayCrossing = false;
	#receivedWhileReconciling = false;
	#lastReconciledUtcDay: number;

	constructor(ports: StartupPorts) {
		this.#ports = ports;
		this.#lastReconciledUtcDay = toUtcDay(ports.now()).getTime();
	}

	/** what the shell draws. A copy, so nothing outside this unit can write to it. */
	get snapshot(): StartupSnapshot {
		return { ...this.#snapshot };
	}

	/** register a listener called after every change. Returns its own removal. */
	observe(observer: (snapshot: StartupSnapshot) => void) {
		this.#observers.add(observer);

		return () => this.#observers.delete(observer);
	}

	#set(changes: Partial<StartupSnapshot>) {
		this.#snapshot = { ...this.#snapshot, ...changes };

		for (const observer of this.#observers) {
			observer(this.snapshot);
		}
	}

	/**
	 * Enter the failure state, and write down what happened.
	 *
	 * **The screen stopped showing the error, so something has to keep it.** `startup-error.svelte`
	 * refuses the message deliberately and offers the diagnostics folder instead, which is only an
	 * honest offer if the failure is actually in there.
	 *
	 * The three places that can fail a startup call this rather than setting the state themselves,
	 * because three copies of *set the state, format the error, show the window* is how one of them
	 * comes to skip a step.
	 */
	async #fail(error: unknown) {
		const message = this.#ports.describeError(error);

		this.#set({
			recovery: null,
			state: 'error',
			error: message,
			hasFailedUnreadable: this.#snapshot.hasFailedUnreadable || !this.#snapshot.isI18nReady
		});
		this.#ports.recordFailure(message);

		await this.#ports.window.show();
	}

	/**
	 * Put the sign-in wall up, and leave it up.
	 *
	 * Everything the application knows how to draw is behind it, so this clears what was drawn for
	 * whoever was here before: the query cache holds a workspace this machine may no longer read,
	 * and a screen rendered from it after a sign-out is the criterion failing quietly rather than
	 * loudly.
	 */
	async #raiseSignInWall(reason: SignInReason) {
		this.#ports.cache.clear();
		this.#set({
			error: null,
			recovery: null,
			signInReason: reason,
			state: 'sign-in',
			railIsUp: true
		});

		await this.#ports.window.show();
	}

	/**
	 * Whether startup may carry on, raising the wall where it may not.
	 *
	 * Every caller reads `if (!(await admit())) return`, because there is nothing to fall through
	 * to: what follows an unadmitted machine is the wall, and it is already up by then.
	 */
	async #admit() {
		const admission = organizationAdmission(this.#snapshot.organization);

		if (admission.kind !== 'signInRequired') {
			return true;
		}

		await this.#raiseSignInWall(admission.reason);

		return false;
	}

	/**
	 * Whether the admitted member has a workspace to open, opening one where they do and drawing
	 * the state where they do not.
	 *
	 * **Admitted and going nowhere is a state rather than a failure.** An organization whose owner
	 * has created no workspace yet admits its members to nothing behind the wall, and the bootstrap
	 * that opens a workspace has nothing to open. The rail is up, because a person is in.
	 *
	 * **Where there is one, the one this machine had open last is opened again, and otherwise the
	 * first.** The choice is made here and handed to the shell, which holds the credential the
	 * vault unsealed for it; the bootstrap that follows finds the replica already named. A
	 * workspace the session no longer holds a grant on is not reopened, because the grant is what
	 * says it may be.
	 */
	async #hasWorkspace() {
		const admission = organizationAdmission(this.#snapshot.organization);

		if (admission.kind !== 'admitted') {
			return true;
		}

		const { workspaces } = admission.session;

		if (workspaces.length === 0) {
			this.#set({ error: null, recovery: null, state: 'no-workspace', railIsUp: true });
			await this.#ports.window.show();

			return false;
		}

		const last = this.#snapshot.remoteSync?.workspace.remoteId ?? null;
		const chosen = workspaces.find((workspace) => workspace.id === last) ?? workspaces[0];

		if (chosen) {
			await this.#ports.organization.openWorkspace(chosen.id);
		}

		return true;
	}

	#applyRecovery(recovery: Recovery) {
		if (!hasRecoveryData(recovery)) {
			this.#set({ recovery: null });

			return false;
		}

		if (recovery.status === 'pending') {
			this.#set({ recovery, state: 'recovery' });

			return true;
		}

		this.#set({ recovery: null });

		return false;
	}

	/**
	 * Everything behind the wall: the workspace opens, changes come down, statuses are recomputed.
	 *
	 * The loading screen's stages are reported where they actually happen. Signing in and retrying
	 * a session both land here rather than at the top, so those paths start the bar at the third
	 * of five, which is what they have genuinely done.
	 */
	async #continue() {
		this.#ports.reportStage('workspace');

		const recovery = await this.#ports.workspace.bootstrap();

		if (this.#applyRecovery(recovery)) {
			await this.#ports.window.show();

			return;
		}

		// **The wall is decided again here, because the bootstrap can change the answer.** What it
		// opens is read back afterwards, and a member whose place changed under them while it ran
		// meets the wall rather than a database that is no longer theirs. The sync state is read
		// beside it because the changes stage is what spends it.
		this.#set({
			remoteSync: await this.#ports.remoteSync.getState(),
			organization: await this.#ports.organization.getState()
		});

		if (!(await this.#admit())) {
			return;
		}

		// **`received` is dropped here on purpose**, which is the one place that is true: the
		// reconcile two lines down is a whole-table pass over exactly what a pull would have made
		// stale, and the render has not happened yet.
		this.#ports.reportStage('changes');
		const synced = await this.#ports.workspace.syncNow(this.#snapshot.remoteSync);
		this.#set({ remoteSync: synced.state });

		// a session ended from another machine while this one was closed is learned at this
		// pull, and the shell has already signed the member out on its side: where the machine
		// stands is read again, which raises the wall, rather than going on to a workspace nobody
		// is signed in to (effort 826, requirement 22).
		if (synced.standing === 'signedOutElsewhere') {
			await this.standingChanged();

			return;
		}

		this.#ports.reportStage('records');
		const { reconciledAt } = await this.#ports.workspace.reconcile();
		this.#lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();

		this.#set({ recovery: null, state: 'ready', railIsUp: true });

		// the last stage is timed by finishing, because nothing follows it to time it.
		this.#ports.reportComplete();

		await this.#ports.window.show();
	}

	/** Start the application. What the shell calls once, on mount. */
	async start() {
		this.#ports.reportStage('settings');
		this.#set({ state: 'loading', error: null, recovery: null, remoteSync: null });

		try {
			// the shell's own settings, read off the shell. They carry the locale the sign-in screen
			// is drawn in, so it has to be readable before there is an account, and a procedure is
			// not, now that a request names its acting user.
			const settings = await this.#ports.settings.get();
			const chosen = settings.locale ?? this.#ports.locale.base;

			// **The appearance before anything can be shown.** The window is created hidden and
			// every path below ends by showing it, so drawing the reader's choice here is what keeps
			// the first frame from painting in the wrong one. Until this line the appearance follows
			// the system, which is also what a launch whose settings cannot be read is shown in.
			this.#ports.appearance.apply(settings.appearance);

			// **The reader's own locale first, so the loading screen can be drawn.** This loaded
			// every locale before setting one, and nothing renders until a locale is ready, so the
			// application's true first frame was an empty window for the whole of the stage the bar
			// calls `settings`: a loading screen absent for the first stage of loading fails its own
			// purpose.
			await this.#ports.locale.load(chosen);
			this.#ports.locale.set(chosen);

			// the gate opens, and the pre-locale failure screen has nothing left to be true about.
			this.#set({ isI18nReady: true, hasFailedUnreadable: false });

			// **The rest still load inside this stage, and the reason is the settings page.**
			// `changeLocale` there calls `set` without awaiting a load, on the standing guarantee
			// that every locale is already in memory. Deferring these past startup would leave that
			// call switching to a dictionary that is not there, so they are merely moved after the
			// first frame rather than out of the startup path.
			for (const locale of this.#ports.locale.all) {
				if (locale !== chosen) {
					await this.#ports.locale.load(locale);
				}
			}

			this.#ports.reportStage('account');
			this.#set({
				remoteSync: await this.#ports.remoteSync.getState(),
				organization: await this.#ports.organization.getState()
			});

			// **The wall, and everything below this line is behind it.** The bootstrap opens the
			// database and the reconcile writes to it, so requirement 3 is this ordering rather than
			// a screen: none of it runs before somebody is admitted. The locale is loaded above it
			// just as deliberately, because the wall itself has to be readable in the language its
			// reader chose.
			if (!(await this.#admit())) {
				return;
			}

			if (!(await this.#hasWorkspace())) {
				return;
			}

			await this.#continue();
		} catch (error) {
			this.#set({ remoteSync: null });
			await this.#fail(error);
		}
	}

	/**
	 * Sign in at the wall, by username and password, and go straight on into the application on
	 * the far side of it.
	 *
	 * **One call, and it is a key derivation per member a person is waiting on.** The username
	 * and the password are handed to the shell and never held here; what comes back is where the
	 * machine stands, and the wall reads that. A refusal is a failure the wall says, with the one
	 * sentence the shell allows it, the same for a wrong password, an unknown username and a
	 * username held by somebody else. The person is still standing at the wall, so an error
	 * screen would take away the control they need. A startup that fails after the sign-in has
	 * succeeded is the ordinary failure every other path here reports, and reads as one.
	 *
	 * **It is the second way in rather than the usual one** (effort 826, requirement 12). A
	 * machine that has signed in once is signed in again by the first `getState` of the launch,
	 * so the wall is what a sign-out, a new machine and a key that no longer opens the vault
	 * lead to.
	 */
	async signIn(username: string, password: string) {
		if (this.#snapshot.isSigningIn) {
			return;
		}

		this.#set({ isSigningIn: true, error: null });

		try {
			this.#set({ organization: await this.#ports.organization.signIn(username, password) });
		} catch (error) {
			this.#set({ error: this.#ports.describeError(error), isSigningIn: false });

			return;
		}

		this.#rememberSession();

		// **The card stays closed until the loading surface is up.** Opening the workspace is a
		// pull of the organization replica and an open of the workspace's own, seconds on a real
		// network, and the card is still what is on screen for all of it: a second submit in that
		// window would derive a second key and run the way in twice, and a disconnect would delete
		// the replica the open is reading. Cleared on every path that leaves the person at a wall.
		try {
			if (!(await this.#admit())) {
				return;
			}

			if (!(await this.#hasWorkspace())) {
				return;
			}
		} finally {
			this.#set({ isSigningIn: false });
		}

		await this.#enterApplication();
	}

	/**
	 * what the way through the wall does once it is through it.
	 *
	 * The session is remembered where the settings page reads it, and the held API context is
	 * dropped: it was built while nobody was signed in, so it belongs to nobody, nothing else
	 * rebuilds it, and it outlives this screen by the whole run of the process.
	 */
	#rememberSession() {
		const { remoteSync } = this.#snapshot;

		if (remoteSync) {
			this.#ports.cache.rememberRemoteSync(remoteSync);
		}

		this.#ports.cache.forgetContext();
	}

	async #enterApplication() {
		try {
			this.#set({ state: 'loading' });
			await this.#continue();
		} catch (error) {
			await this.#fail(error);

			return;
		}

		// the owner's machine keeps the organization's credentials from lapsing. It is best effort
		// and fired here rather than awaited: it reaches Turso, and entering the application must not
		// wait on a network or fail with it, which is what lets sign-in work offline (requirement 18).
		// A machine that is not the owner's, or has nothing due, does nothing.
		void this.#ports.organization.renewDue().catch(() => {});
	}

	/** Try the whole startup again. What the failure and recovery screens offer. */
	retry() {
		return this.start();
	}

	/**
	 * Where the machine stands changed under the shell: read it again, admit on it, open a
	 * workspace where there is one, and go on into the application. The same path a sign-in takes
	 * past the wall, for the two things that happen beside the wall rather than at it: the
	 * no-workspace surface created a workspace for the member who is in, and the first run
	 * created an organization and signed its owner in on a route the wall had let through.
	 *
	 * **The loading surface goes up before the standing is read**, rather than after, because
	 * reading it reaches the shell: the screen that called this stayed on its own form for the
	 * whole of that round trip, and what a person saw was the surface they had just finished
	 * with sitting there doing nothing. Everything after the read draws the loading surface
	 * anyway, so this only moves it in front of the one call that was under it.
	 *
	 * **A caller with something to ready first hands it in as `prepare`** (effort 832, requirement
	 * 18). It runs under the loading surface as that pass's first stage, so the first run creating
	 * the owner's first workspace is one loading pass rather than a busy walk followed by one. What
	 * it makes is then read with everything else. **A `prepare` that fails does not stop the pass**:
	 * the standing is read anyway, and a machine it left with no workspace lands on the no-workspace
	 * surface, which already offers the create. Saying what went wrong is the `prepare`'s own, as it
	 * is for any mutation, so nothing here repeats it.
	 *
	 * **A caller that has to leave its own address hands the move in as `arrive`** (effort 832,
	 * requirement 19). It is waited for under the loading surface before the standing is read, and
	 * it is not a stage: moving the address costs nothing a bar could show. Without it the pass
	 * could end while the address was still the caller's, and a screen that opens signed out, the
	 * connect screen, would be drawn again over a finished pass. A move that fails is not a reason
	 * to stop: the standing is read anyway, and the shell draws what it says.
	 */
	async standingChanged({
		prepare,
		arrive
	}: { prepare?: () => Promise<unknown>; arrive?: () => Promise<unknown> } = {}) {
		// where the screen goes back to if the read fails: the caller is standing on a surface
		// that can say so, and a failure here is not a reason to leave them under a loading
		// surface that has nothing left to load.
		const before = this.#snapshot.state;

		this.#set({ state: 'loading', error: null });

		if (prepare) {
			this.#ports.reportStage('prepare');

			try {
				await prepare();
			} catch {
				// said by the `prepare`. The pass ends at its first stage, so the next one the
				// no-workspace surface starts is not counted as its continuation.
				this.#ports.reportComplete();
			}
		}

		if (arrive) {
			try {
				await arrive();
			} catch {
				// the address stays where it was, and what the standing says is drawn over it.
			}
		}

		try {
			this.#set({ organization: await this.#ports.organization.getState() });
		} catch (error) {
			this.#set({ state: before, error: this.#ports.describeError(error) });

			return;
		}

		this.#rememberSession();

		if (!(await this.#admit())) {
			return;
		}

		if (!(await this.#hasWorkspace())) {
			return;
		}

		await this.#enterApplication();
	}

	/**
	 * Open another of the workspaces the member holds, from inside the application.
	 *
	 * **The sign-in path past the wall, under the loading surface, and not a switch in place.**
	 * The shell records the chosen workspace as current and opens its replica, and then the same
	 * open, changes and records stages a sign-in runs bring the application up on it. An in-place
	 * switch would redraw every list under the new name while the old rows were still on screen,
	 * which is the failure [[rules/data]] on cached queries is written against; the loading
	 * surface for a second is the cost, and it is the second a sign-in costs.
	 *
	 * **What was drawn is dropped after the shell has opened the workspace, not before.** The
	 * loading surface replaces the page as soon as this sets `loading`, so by the time the open
	 * has come back nothing is drawing the page's queries and they can go. The rail is still
	 * drawing its own, and those are refetched rather than removed, since a query removed from
	 * under a live observer is never heard from again; the remote-sync query is then seeded with
	 * what the changes stage read, so the rail names the new workspace without waiting on it.
	 *
	 * The session is not remembered again: the member and the database proxy are what they were,
	 * and only the workspace behind the proxy changed. A failure is the ordinary startup failure,
	 * whose retry reopens whatever the shell recorded as current.
	 */
	async switchWorkspace(workspaceId: string) {
		if (this.#snapshot.isSigningIn || this.#snapshot.state === 'loading') {
			return;
		}

		this.#set({ state: 'loading', error: null, recovery: null });

		try {
			await this.#ports.organization.openWorkspace(workspaceId);
		} catch (error) {
			await this.#fail(error);

			return;
		}

		this.#ports.cache.dropUndrawn();
		await this.#ports.cache.invalidateAll();

		await this.#enterApplication();

		const { state, remoteSync } = this.#snapshot;

		if (state === 'ready' && remoteSync) {
			this.#ports.cache.rememberRemoteSync(remoteSync);
		}
	}

	/**
	 * Somebody signed out, here or on another window.
	 *
	 * The keys this process held are dropped by the shell, and the held context names a member
	 * whose vault is no longer open, which nothing else in the process would ever notice. The wall
	 * goes up in whichever of its two states the machine is now in, which after a sign-out is
	 * locked: the organization is still joined, and a password opens it again.
	 */
	async signOut() {
		this.#ports.cache.forgetContext();

		const organization = await this.#ports.organization.signOut().catch(() => null);

		this.#set({
			remoteSync: await this.#ports.remoteSync.getState().catch(() => null),
			organization: organization ?? {
				organization: null,
				session: null,
				holdsTursoAuthority: false,
				signedOutElsewhere: false
			}
		});

		if (!(await this.#admit())) {
			return;
		}

		// the shell said nobody signed out. The wall goes up regardless: this was asked for.
		await this.#raiseSignInWall('locked');
	}

	/**
	 * Forget the organization this machine holds: the wall's way out while signed out, and the
	 * organization page's while signed in, where the shell signs out first.
	 *
	 * **The confirm is the screen's, and this runs after it.** The shell deletes every replica,
	 * empties the record and clears the Turso authority in one call, and what follows is the path
	 * `standingChanged` already takes: read where the machine stands again, which is now nothing,
	 * and admit on it, which raises the wall as a machine with nothing on it. A refusal is said on
	 * the wall the person is still standing at, as a wrong password is, rather than as a failure
	 * screen that would take the wall away with it.
	 *
	 * Refused while a password is being tried: the shell is deriving a key against a vault this
	 * would delete from under it.
	 */
	async disconnect() {
		if (this.#snapshot.isSigningIn) {
			return;
		}

		try {
			await this.#ports.organization.disconnect();
		} catch (error) {
			this.#set({ error: this.#ports.describeError(error) });

			return;
		}

		// the forget emptied the machine's own sync record as well, so the workspace it named is
		// not one the next sign-in should look for.
		this.#set({ remoteSync: await this.#ports.remoteSync.getState().catch(() => null) });

		await this.standingChanged();
	}

	/**
	 * What a sync manager reported.
	 *
	 * Rows arriving from another device can make a status that was right before the pull wrong
	 * after it, so a pull that landed rows reconciles. The guard is the day-crossing pass's, shared
	 * rather than duplicated: both run a whole-table reconcile and two at once is one of them
	 * wasted.
	 *
	 * **A report for a workspace other than the one open is dropped whole.** A dispatch in flight
	 * while `switchWorkspace` ran reports for the workspace it started on, after the cache has
	 * been cleared for the new one; applied, it would reconcile the new workspace for rows that
	 * landed in the old one and announce them to a person who never saw them.
	 */
	async applySyncOutcome(outcome: SyncOutcome) {
		const state = await this.#ports.remoteSync.getState().catch(() => null);
		const open = (state ?? this.#snapshot.remoteSync)?.workspace.remoteId ?? null;

		if (outcome.workspaceId !== open) {
			return;
		}

		if (state) {
			this.#set({ remoteSync: state });
			this.#ports.cache.rememberRemoteSync(state);
		}

		await this.#ports.cache.invalidateRemoteSync();

		if (!outcome.received) {
			return;
		}

		// rows that land while a day-crossing pass is out are announced once it is back, rather
		// than dropped: that pass started before they arrived and may have read the tables first,
		// and the query cache is `staleTime: Infinity`, so a pull nobody announced is rows the
		// screen never shows. Both passes are whole-table, which is why they do not overlap.
		if (this.#isReconcilingDayCrossing) {
			this.#receivedWhileReconciling = true;

			return;
		}

		await this.#announceReceived();
	}

	/** the whole-table pass a pull that brought rows owes, and the announcement after it. */
	async #announceReceived() {
		this.#isReconcilingDayCrossing = true;

		try {
			this.#lastReconciledUtcDay = toUtcDay(
				await this.#ports.workspace.announceReceived()
			).getTime();
		} finally {
			this.#isReconcilingDayCrossing = false;
		}

		if (this.#receivedWhileReconciling) {
			this.#receivedWhileReconciling = false;
			await this.#announceReceived();
		}
	}

	/**
	 * Recompute what the date decides, where the date has moved under a running application.
	 *
	 * Derived state moves only at UTC day boundaries, so an application left running crosses into
	 * wrong statuses at midnight UTC. Comparing calendar days on every tick, rather than counting
	 * elapsed ticks, keeps the check correct across sleep and wake.
	 */
	async reconcileOnDayCrossing() {
		if (this.#snapshot.state !== 'ready' || this.#isReconcilingDayCrossing) {
			return;
		}

		if (toUtcDay(this.#ports.now()).getTime() === this.#lastReconciledUtcDay) {
			return;
		}

		this.#isReconcilingDayCrossing = true;

		try {
			const { reconciledAt } = await this.#ports.workspace.reconcile();
			this.#lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();
			await this.#ports.cache.invalidateAll();
		} catch {
			/* the next tick retries */
		} finally {
			this.#isReconcilingDayCrossing = false;
		}

		// a pull that brought rows while this pass was out is owed its announcement.
		if (this.#receivedWhileReconciling) {
			this.#receivedWhileReconciling = false;
			await this.#announceReceived();
		}
	}

	/** whether the window may close without syncing first, which is every state but `ready`. */
	get closesWithoutSyncing() {
		return this.#snapshot.state !== 'ready';
	}

	/**
	 * Hide the window, push what this machine holds, then close.
	 *
	 * Hiding first is what makes the sync feel free: the window is gone by the time it runs, so a
	 * slow push looks like an application that closed rather than one that hung on the way out.
	 */
	async closeWindow(skipSync = false) {
		if (this.#isFinalizingWindowClose) {
			return;
		}

		if (!skipSync && this.#isSyncingWindowClose) {
			return;
		}

		if (!skipSync) {
			this.#isSyncingWindowClose = true;
		}

		try {
			await this.#ports.window.hide();

			if (!skipSync && this.#snapshot.state === 'ready') {
				this.#set({
					remoteSync: (await this.#ports.workspace.syncBeforeExit(this.#snapshot.remoteSync)).state
				});
			}
		} catch {
			/* ignore close sync failures */
		} finally {
			this.#isSyncingWindowClose = false;
			this.#isFinalizingWindowClose = true;

			try {
				await this.#ports.window.close();
			} catch {
				this.#isFinalizingWindowClose = false;
			}
		}
	}

	/** whether a close is already past the point of being interrupted. */
	get isClosing() {
		return this.#isFinalizingWindowClose;
	}
}

export const createStartup = (ports: StartupPorts) => new Startup(ports);
