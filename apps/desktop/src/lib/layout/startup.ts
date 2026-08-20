import type { GoogleSignInPhase, Recovery, RemoteSyncState } from '$lib/platform/host';
import { workspaceAdmission } from '$lib/sync/admission';
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
 */
export type StartupState = 'loading' | 'sign-in' | 'ready' | 'error' | 'recovery';

/** why the wall is up, which is only read while it is. */
export type SignInReason = 'noAccount' | 'windowClosed' | 'noSession';

/** everything the shell draws itself from. Read-only to it; only this unit writes. */
export type StartupSnapshot = {
	state: StartupState;
	/** what went wrong, already rendered for a reader. `null` where nothing did. */
	error: string | null;
	recovery: Recovery | null;
	remoteSync: RemoteSyncState | null;
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
	isSigningIn: boolean;
	isRetryingSession: boolean;
	signInPhase: GoogleSignInPhase | null;
};

/** what a sync manager reported, as this unit needs to read it. */
export type SyncOutcome = { action: string; received: boolean };

/**
 * What startup reaches for outside itself.
 *
 * Grouped by the thing being reached rather than by the call, so a fake supplies a window or a
 * control plane rather than eleven unrelated functions.
 */
export type StartupPorts = {
	window: {
		show(): Promise<unknown>;
		hide(): Promise<unknown>;
		close(): Promise<unknown>;
	};
	/** the shell's own settings, read off the host: they carry the locale the wall is drawn in. */
	settings: { get(): Promise<{ locale?: string | null }> };
	remoteSync: {
		getState(): Promise<RemoteSyncState>;
		establishSession(): Promise<RemoteSyncState>;
	};
	/** the consent screen's progress, so the wall can say which step it is on. */
	auth: { onPhase(listen: (phase: GoogleSignInPhase) => void): Promise<() => void> };
	workspace: {
		bootstrap(): Promise<Recovery>;
		reconcile(): Promise<{ reconciledAt: number }>;
		syncNow(state: RemoteSyncState | null): Promise<{ state: RemoteSyncState }>;
		syncBeforeExit(state: RemoteSyncState | null): Promise<{ state: RemoteSyncState }>;
		/** a pull landed rows; announce them and say the day they were reconciled on. */
		announceReceived(): Promise<number>;
	};
	signIn: {
		withGoogle(): Promise<RemoteSyncState>;
		/** abandoning the consent screen is an answer rather than a failure. */
		isCancellation(error: unknown): boolean;
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
		rememberRemoteSync(state: RemoteSyncState): void;
		invalidateRemoteSync(): Promise<unknown>;
		invalidateAll(): Promise<unknown>;
		/** the held API context names an account; drop it when that stops being true. */
		forgetContext(): void;
	};
	/** a thrown value as a reader should see it. The route's translations, from outside. */
	describeError(error: unknown): string;
	/** the window closed with no contact, so replication stopped. The one outcome to act on. */
	onSessionExpired(): void;
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
	signInReason: 'noAccount',
	railIsUp: false,
	isI18nReady: false,
	isSigningIn: false,
	isRetryingSession: false,
	signInPhase: null
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

		this.#set({ recovery: null, state: 'error', error: message });
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
		const admission = workspaceAdmission(this.#snapshot.remoteSync, this.#ports.now());

		if (admission.kind !== 'signInRequired') {
			return true;
		}

		await this.#raiseSignInWall(admission.reason);

		return false;
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

		// **The wall is decided again here, because the bootstrap can change the answer.** It is
		// what mints, and the mint is what learns this account is no longer a member of the
		// workspace this machine held, which gives up the workspace and the session. Admitting only
		// before it would carry on into a database that is no longer anybody's and fail on the
		// first read, with the same thing happening on every launch after.
		this.#set({ remoteSync: await this.#ports.remoteSync.getState() });

		if (!(await this.#admit())) {
			return;
		}

		// **`received` is dropped here on purpose**, which is the one place that is true: the
		// reconcile two lines down is a whole-table pass over exactly what a pull would have made
		// stale, and the render has not happened yet.
		this.#ports.reportStage('changes');
		this.#set({
			remoteSync: (await this.#ports.workspace.syncNow(this.#snapshot.remoteSync)).state
		});

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

			// **The reader's own locale first, so the loading screen can be drawn.** This loaded
			// every locale before setting one, and nothing renders until a locale is ready, so the
			// application's true first frame was an empty window for the whole of the stage the bar
			// calls `settings`: a loading screen absent for the first stage of loading fails its own
			// purpose.
			await this.#ports.locale.load(chosen);
			this.#ports.locale.set(chosen);

			this.#set({ isI18nReady: true });

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
			this.#set({ remoteSync: await this.#ports.remoteSync.getState() });

			// **The wall, and everything below this line is behind it.** The bootstrap opens the
			// database and the reconcile writes to it, so requirement 3 is this ordering rather than
			// a screen: none of it runs before there is an account. The locale is loaded above it
			// just as deliberately, because the wall itself has to be readable in the language its
			// reader chose.
			if (!(await this.#admit())) {
				return;
			}

			await this.#continue();
		} catch (error) {
			this.#set({ remoteSync: null });
			await this.#fail(error);
		}
	}

	/**
	 * Sign in at the wall, and go straight on into the application on the far side of it.
	 *
	 * The two failures are kept apart deliberately. A sign-in that fails leaves the wall up and
	 * says why on it: the person is still standing at it, and an error screen would take away the
	 * control they need. A startup that fails after a sign-in has succeeded is the ordinary failure
	 * every other path here reports, and reads as one.
	 */
	async signIn() {
		if (this.#snapshot.isSigningIn) {
			return;
		}

		this.#set({ isSigningIn: true, signInPhase: 'authorizing', error: null });

		// opened before the call and closed after it: an event that arrives with nobody listening
		// is the only way this screen can miss the moment the consent screen was answered.
		const unlistenPhase = await this.#ports.auth.onPhase((phase) => {
			this.#set({ signInPhase: phase });
		});

		try {
			this.#set({ remoteSync: await this.#ports.signIn.withGoogle() });
		} catch (error) {
			// abandoning the consent screen is an answer rather than a failure, and says nothing:
			// the person closed that window themselves and is looking at this one.
			if (!this.#ports.signIn.isCancellation(error)) {
				this.#set({ error: this.#ports.describeError(error) });
			}

			return;
		} finally {
			unlistenPhase();
			this.#set({ isSigningIn: false, signInPhase: null });
		}

		this.#rememberSession();

		if (!(await this.#admit())) {
			// signed in with Google, and still not through: the consent screen was answered and the
			// control plane was not reached, so this machine holds an identity and no session.
			// `workspaceAdmission` has already named that situation `noSession`, and the wall says so
			// and offers the call that failed. Answering the consent screen again lands in exactly
			// the same place. Nothing is set here, which is the point: what the screen says comes
			// from the state rather than from a sentence written at one of the places that reach it.
			return;
		}

		await this.#enterApplication();
	}

	/**
	 * Reach the control plane with the identity this machine already holds, and go on if that works.
	 *
	 * **The retry for the `noSession` wall, and it opens no browser.** What failed was one call
	 * after the sign-in, so this repeats that call and nothing else. Being unreachable again is not
	 * an error and says nothing new: admission returns the same situation, the wall stays where it
	 * is, and the notice on it already reads *check your connection and try again*.
	 */
	async retrySession() {
		if (this.#snapshot.isRetryingSession || this.#snapshot.isSigningIn) {
			return;
		}

		this.#set({ isRetryingSession: true, error: null });

		try {
			this.#set({ remoteSync: await this.#ports.remoteSync.establishSession() });
			this.#rememberSession();

			if (!(await this.#admit())) {
				return;
			}
		} catch (error) {
			this.#set({ error: this.#ports.describeError(error) });

			return;
		} finally {
			this.#set({ isRetryingSession: false });
		}

		await this.#enterApplication();
	}

	/**
	 * what both ways through the wall do once they are through it.
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
		}
	}

	/** Try the whole startup again. What the failure and recovery screens offer. */
	retry() {
		return this.start();
	}

	/**
	 * Somebody signed out, here or on another window.
	 *
	 * The held context names an account this machine no longer has credentials for, and nothing
	 * else in the process would ever notice.
	 */
	async signOut() {
		this.#ports.cache.forgetContext();
		this.#set({ remoteSync: await this.#ports.remoteSync.getState().catch(() => null) });
		await this.#raiseSignInWall('noAccount');
	}

	/**
	 * What a sync manager reported.
	 *
	 * Rows arriving from another device can make a status that was right before the pull wrong
	 * after it, so a pull that landed rows reconciles. The guard is the day-crossing pass's, shared
	 * rather than duplicated: both run a whole-table reconcile and two at once is one of them
	 * wasted.
	 */
	async applySyncOutcome(outcome: SyncOutcome) {
		const state = await this.#ports.remoteSync.getState().catch(() => null);

		if (state) {
			this.#set({ remoteSync: state });
			this.#ports.cache.rememberRemoteSync(state);
		}

		// the window closed with no contact, so replication has stopped and the workspace is
		// otherwise untouched. It is raised here rather than left to the invalidation below because
		// it is the one outcome the user has to act on.
		if (outcome.action === 'signInRequired') {
			this.#ports.onSessionExpired();
		}

		await this.#ports.cache.invalidateRemoteSync();

		if (outcome.received && !this.#isReconcilingDayCrossing) {
			this.#isReconcilingDayCrossing = true;

			try {
				this.#lastReconciledUtcDay = toUtcDay(
					await this.#ports.workspace.announceReceived()
				).getTime();
			} finally {
				this.#isReconcilingDayCrossing = false;
			}
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
