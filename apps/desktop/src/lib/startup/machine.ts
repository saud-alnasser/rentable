import type { HeldByVersion } from '$lib/organization';
import type { Recovery } from '$lib/update';
import { organizationAdmission } from '$lib/sync';
import type { StartupPorts } from './ports';
import { Reconciliation } from './reconcile';
import { isOrganizationByVersion, organizationNewer, refusalKind } from './refusal';
import {
	hasRecoveryData,
	INITIAL,
	type SignInReason,
	type StartupSnapshot,
	type WorkspaceHold
} from './snapshot';

/**
 * THE STARTUP MACHINE
 *
 * The state, and the pass that carries a machine from the process starting to a person inside a
 * workspace: the settings and the locale, the wall, the workspace chosen, the bootstrap and the
 * stages behind it. Every way in (a launch, a sign-in, a changed standing, a switch) ends on this
 * pass, and every failure it meets is said the one way `fail` says it.
 *
 * Its members are the unit's internals rather than its API: `./startup` is what the shell holds,
 * and the ways through the wall (`./wall`, `./switch`), the heartbeat (`./heartbeat`) and the
 * close (`./close`) are written against this. Nothing outside `startup/` reaches it.
 */
export class StartupMachine {
	readonly ports: StartupPorts;
	/** the whole-table passes, and the day the last one reconciled on. */
	readonly reconciliation: Reconciliation;

	#snapshot: StartupSnapshot = { ...INITIAL };
	#observers = new Set<(snapshot: StartupSnapshot) => void>();
	/** the workspace the last open asked for, which a refusal from the bootstrap is about. */
	#opening: string | null = null;
	/**
	 * every workspace this run found past what it reads, by its id (effort 857, requirement 8).
	 * Nothing asks the shell to open one of these again in this run: a newer build is what opens
	 * it, and that is a restart, so a retry or a second choice of it goes straight back to its
	 * update-required screen rather than round the same refusal.
	 */
	#unreadable = new Map<string, WorkspaceHold>();

	constructor(ports: StartupPorts) {
		this.ports = ports;
		this.reconciliation = new Reconciliation(ports, () => this.heldByVersion !== null);
	}

	/** what the shell draws. A copy, so nothing outside this unit can write to it. */
	get snapshot(): StartupSnapshot {
		return { ...this.#snapshot };
	}

	/** what the snapshot holds now, read in place by the unit's own paths. */
	get current(): Readonly<StartupSnapshot> {
		return this.#snapshot;
	}

	/**
	 * what holds the session open here by its version: the organization, or the workspace open,
	 * upgraded past what this build writes or reads (effort 857); `null` where nothing does. A
	 * verdict on a workspace that is not the one open holds nothing here.
	 */
	get heldByVersion(): HeldByVersion | null {
		const held = this.#snapshot.organization?.heldByVersion ?? null;

		if (!held || !this.#snapshot.organization?.session) {
			return null;
		}

		if (held.target === 'organization') {
			return held;
		}

		return held.target.workspace === (this.#snapshot.sync?.workspace.remoteId ?? null)
			? held
			: null;
	}

	/** register a listener called after every change. Returns its own removal. */
	observe(observer: (snapshot: StartupSnapshot) => void) {
		this.#observers.add(observer);

		return () => this.#observers.delete(observer);
	}

	set(changes: Partial<StartupSnapshot>) {
		// a detail left behind by an error that has since changed would be drawn under a sentence
		// it does not belong to.
		const detail = 'error' in changes && !('errorDetail' in changes) ? { errorDetail: null } : {};

		this.#snapshot = { ...this.#snapshot, ...detail, ...changes };

		for (const observer of this.#observers) {
			observer(this.snapshot);
		}
	}

	/** a thrown value as the snapshot holds it: the reader's sentence, and the shell's words apart. */
	describe(error: unknown): Pick<StartupSnapshot, 'error' | 'errorDetail'> {
		return {
			error: this.ports.describeError(error),
			errorDetail: this.ports.detailError(error)
		};
	}

	/**
	 * Enter the failure state, and write down what happened; or, where the failure is a refusal,
	 * put the person where the refusal can be answered.
	 *
	 * **A refusal is not the application failing** (effort 857, requirements 7 and 8). Which one
	 * it is decides where it goes (`./refusal`): a workspace past what this build reads stands on
	 * the update-required screen, an organization that would not open goes back to the switcher
	 * with its reason recorded against it, and one about the password goes to the wall. None of the
	 * three is the failure screen, whose retry would only meet the same refusal again.
	 *
	 * **The screen keeps the reason behind its details, so something has to keep the rest.**
	 * `component/error.svelte` offers the diagnostics folder, which is only an honest offer if the
	 * failure is actually in there.
	 *
	 * The places that can fail a startup call this rather than setting the state themselves,
	 * because three copies of *set the state, format the error, show the window* is how one of them
	 * comes to skip a step.
	 */
	async fail(error: unknown) {
		const kind = refusalKind(this.ports.refusalReason(error));
		const { organization } = this.#snapshot;

		if (kind === 'workspace') {
			const workspaceId = this.#opening ?? this.#snapshot.sync?.workspace.remoteId ?? null;

			if (workspaceId) {
				await this.hold(workspaceId, error);

				return;
			}
		}

		const organizationId = organization?.session?.organizationId ?? organization?.selected ?? null;

		if ((kind === 'organization' || kind === 'link') && organizationId) {
			await this.returnToSwitcher(organizationId, error);

			return;
		}

		if (kind === 'password' && organizationId) {
			await this.#leaveSession();
			await this.raiseSignInWall('locked');
			this.set(this.describe(error));

			return;
		}

		const message = this.ports.describeError(error);
		const detail = this.ports.detailError(error);

		this.set({
			recovery: null,
			state: 'error',
			error: message,
			errorDetail: detail,
			hasFailedUnreadable: this.#snapshot.hasFailedUnreadable || !this.#snapshot.isI18nReady
		});
		this.ports.recordFailure(message, detail);

		await this.ports.window.show();
	}

	/**
	 * Write down why an organization could not be opened, against that organization, where the
	 * switcher reads it (effort 857, requirement 7). `detail` is what the shell said, where it was
	 * carried rather than thrown.
	 */
	recordRefusal(organizationId: string, error: unknown, detail?: string) {
		this.set({
			refusals: {
				...this.#snapshot.refusals,
				[organizationId]: {
					sentence: this.ports.describeError(error),
					detail: detail ?? this.ports.detailError(error),
					byVersion: isOrganizationByVersion(this.ports.refusalReason(error))
				}
			}
		});
	}

	/** that organization opened, so what kept it shut is no longer true. */
	#clearRefusal(organizationId: string) {
		if (!(organizationId in this.#snapshot.refusals)) {
			return;
		}

		const refusals = { ...this.#snapshot.refusals };

		delete refusals[organizationId];
		this.set({ refusals });
	}

	/** end the session that is open, where one is, so the wall and its switcher can be used. */
	async #leaveSession() {
		const organization = this.#snapshot.organization;

		if (!organization?.session) {
			return;
		}

		this.ports.cache.forgetContext();
		this.ports.undo.forget();

		const after = await this.ports.organization.signOut().catch(() => null);

		this.set({ organization: after ?? { ...organization, session: null } });
	}

	/**
	 * An organization could not be opened: record why against it, and put the person back at the
	 * organization switcher, signed out of it where they were in (effort 857, requirement 7).
	 *
	 * **The switcher is on the wall**, and the wall is the one screen every organization is reached
	 * from, so this is the wall of the organization that was refused with the reason in a short
	 * callout above it. Choosing another organization there opens that one; this one's callout
	 * stays until it opens. Nobody is left on a screen they cannot leave.
	 */
	async returnToSwitcher(organizationId: string, error: unknown, detail?: string) {
		this.recordRefusal(organizationId, error, detail);
		await this.#leaveSession();
		await this.raiseSignInWall('locked');
	}

	/**
	 * Stand the update-required screen in place of a workspace this build cannot read (effort 857,
	 * requirement 7), and remember it, so nothing in this run asks the shell to open it again.
	 */
	async hold(workspaceId: string, error: unknown) {
		const name =
			this.#snapshot.organization?.session?.workspaces.find(
				(workspace) => workspace.id === workspaceId
			)?.name ?? '';
		const hold: WorkspaceHold = {
			workspaceId,
			name,
			sentence: this.ports.describeError(error),
			detail: this.ports.detailError(error)
		};

		this.#unreadable.set(workspaceId, hold);
		await this.standHeld(hold);
	}

	/** the update-required screen this run already met for `workspaceId`, or `null`. */
	unreadable(workspaceId: string): WorkspaceHold | null {
		return this.#unreadable.get(workspaceId) ?? null;
	}

	/** put a workspace's update-required screen up, inside the application. */
	async standHeld(hold: WorkspaceHold) {
		this.set({ state: 'held', held: hold, error: null, recovery: null, railIsUp: true });

		await this.ports.window.show();
	}

	/** the workspace an open is about to ask for, which a refusal behind it is then about. */
	opens(workspaceId: string) {
		this.#opening = workspaceId;
	}

	/**
	 * Put the sign-in wall up, and leave it up.
	 *
	 * Everything the application knows how to draw is behind it, so this clears what was drawn for
	 * whoever was here before: the query cache holds a workspace this machine may no longer read,
	 * and a screen rendered from it after a sign-out is the criterion failing quietly rather than
	 * loudly.
	 */
	async raiseSignInWall(reason: SignInReason) {
		this.ports.cache.clear();
		// nothing done in the session behind the wall may be undone in the next one.
		this.ports.undo.forget();
		this.set({
			error: null,
			recovery: null,
			signInReason: reason,
			state: 'sign-in',
			railIsUp: true
		});

		await this.ports.window.show();
	}

	/**
	 * Whether startup may carry on, raising the wall where it may not.
	 *
	 * Every caller reads `if (!(await admit())) return`, because there is nothing to fall through
	 * to: what follows an unadmitted machine is the wall, and it is already up by then.
	 */
	async admit() {
		const { organization } = this.#snapshot;
		const held = organization?.heldByVersion;

		// **a resume the version refused is the organization refused** (effort 857, requirement 7):
		// the shell carries it on the state rather than throwing it, and the person goes to the
		// switcher with the reason above that organization, as for any other refusal of it.
		if (held?.target === 'organization' && held.standing === 'unreadable') {
			const organizationId = organization?.session?.organizationId ?? organization?.selected;

			if (organizationId) {
				await this.returnToSwitcher(organizationId, organizationNewer(held.reason), held.reason);

				return false;
			}
		}

		const admission = organizationAdmission(organization);

		if (admission.kind === 'admitted') {
			this.#clearRefusal(admission.session.organizationId);
		}

		if (admission.kind !== 'signInRequired') {
			return true;
		}

		await this.raiseSignInWall(admission.reason);

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
	async hasWorkspace() {
		const admission = organizationAdmission(this.#snapshot.organization);

		if (admission.kind !== 'admitted') {
			return true;
		}

		const { workspaces } = admission.session;

		if (workspaces.length === 0) {
			this.set({ error: null, recovery: null, state: 'no-workspace', railIsUp: true });
			await this.ports.window.show();

			return false;
		}

		// the last one asked for in this run where there was one, since a retry after a refusal
		// is about that one (effort 857, requirement 8), and otherwise the one the shell recorded.
		const last = this.#opening ?? this.#snapshot.sync?.workspace.remoteId ?? null;
		const chosen = workspaces.find((workspace) => workspace.id === last) ?? workspaces[0];

		if (chosen) {
			// a workspace this run already found past reading is not asked for again: its screen
			// is what a retry lands on (effort 857, requirement 8).
			const known = this.unreadable(chosen.id);

			if (known) {
				await this.standHeld(known);

				return false;
			}

			this.opens(chosen.id);
			await this.ports.organization.openWorkspace(chosen.id);
			// what the held context may do is folded for the workspace open (effort 838,
			// requirement 10), and this is the moment that changes.
			this.ports.cache.forgetContext();
		}

		return true;
	}

	#applyRecovery(recovery: Recovery) {
		if (!hasRecoveryData(recovery)) {
			this.set({ recovery: null });

			return false;
		}

		if (recovery.status === 'pending') {
			this.set({ recovery, state: 'recovery' });

			return true;
		}

		this.set({ recovery: null });

		return false;
	}

	/**
	 * Everything behind the wall: the workspace opens, changes come down, statuses are recomputed.
	 *
	 * The loading screen's stages are reported where they actually happen. Signing in and retrying
	 * a session both land here rather than at the top, so those paths start the bar at the third
	 * of five, which is what they have genuinely done.
	 */
	async continue() {
		// the app looks for a newer release by itself (effort 857, requirement 12), on every pass
		// that reaches here, since a sign-in reaches here without the launch above it.
		this.ports.update.lookAtLaunch();
		this.ports.reportStage('workspace');

		const recovery = await this.ports.workspace.bootstrap();

		if (this.#applyRecovery(recovery)) {
			await this.ports.window.show();

			return;
		}

		// **The wall is decided again here, because the bootstrap can change the answer.** What it
		// opens is read back afterwards, and a member whose place changed under them while it ran
		// meets the wall rather than a database that is no longer theirs. The sync state is read
		// beside it because the changes stage is what spends it.
		this.set({
			sync: await this.ports.sync.getState(),
			organization: await this.ports.organization.getState()
		});

		if (!(await this.admit())) {
			return;
		}

		// **`received` is dropped here on purpose**, which is the one place that is true: the
		// reconcile two lines down is a whole-table pass over exactly what a pull would have made
		// stale, and the render has not happened yet.
		this.ports.reportStage('changes');
		const synced = await this.ports.workspace.syncNow(this.#snapshot.sync);
		this.set({ sync: synced.state });

		// a session ended from another machine while this one was closed is learned at this
		// pull, and the shell has already signed the member out on its side: where the machine
		// stands is read again, which raises the wall, rather than going on to a workspace nobody
		// is signed in to (effort 826, requirement 22).
		if (synced.standing === 'signedOutElsewhere') {
			await this.standingChanged();

			return;
		}

		this.ports.reportStage('records');
		const { reconciledAt } = await this.ports.workspace.reconcile();
		this.reconciliation.settle(reconciledAt);

		this.set({ recovery: null, state: 'ready', railIsUp: true, held: null });

		// the last stage is timed by finishing, because nothing follows it to time it.
		this.ports.reportComplete();

		await this.ports.window.show();
	}

	/** Start the application. What the shell calls once, on mount. */
	async start() {
		this.ports.reportStage('settings');
		this.set({ state: 'loading', error: null, recovery: null, sync: null });

		try {
			// the shell's own settings, read off the shell. They carry the locale the sign-in screen
			// is drawn in, so it has to be readable before there is an account, and a procedure is
			// not, now that a request names its acting user.
			const settings = await this.ports.settings.get();
			const chosen = settings.locale ?? this.ports.locale.base;

			// **The appearance before anything can be shown.** The window is created hidden and
			// every path below ends by showing it, so drawing the reader's choice here is what keeps
			// the first frame from painting in the wrong one. Until this line the appearance follows
			// the system, which is also what a launch whose settings cannot be read is shown in.
			this.ports.appearance.apply(settings.appearance);

			// **The reader's own locale first, so the loading screen can be drawn.** This loaded
			// every locale before setting one, and nothing renders until a locale is ready, so the
			// application's true first frame was an empty window for the whole of the stage the bar
			// calls `settings`: a loading screen absent for the first stage of loading fails its own
			// purpose.
			await this.ports.locale.load(chosen);
			this.ports.locale.set(chosen);

			// the gate opens, and the pre-locale failure screen has nothing left to be true about.
			this.set({ isI18nReady: true, hasFailedUnreadable: false });

			// **The update is looked for as soon as what it finds can be said**, in the reader's
			// language, and before the wall: a machine standing at the wall is a launch too
			// (effort 857, requirement 12).
			this.ports.update.lookAtLaunch();

			// **The rest still load inside this stage, and the reason is the settings page.**
			// `changeLocale` there calls `set` without awaiting a load, on the standing guarantee
			// that every locale is already in memory. Deferring these past startup would leave that
			// call switching to a dictionary that is not there, so they are merely moved after the
			// first frame rather than out of the startup path.
			for (const locale of this.ports.locale.all) {
				if (locale !== chosen) {
					await this.ports.locale.load(locale);
				}
			}

			this.ports.reportStage('account');
			this.set({
				sync: await this.ports.sync.getState(),
				organization: await this.ports.organization.getState()
			});

			// **The wall, and everything below this line is behind it.** The bootstrap opens the
			// database and the reconcile writes to it, so requirement 3 is this ordering rather than
			// a screen: none of it runs before somebody is admitted. The locale is loaded above it
			// just as deliberately, because the wall itself has to be readable in the language its
			// reader chose.
			if (!(await this.admit())) {
				return;
			}

			if (!(await this.hasWorkspace())) {
				return;
			}

			await this.continue();
		} catch (error) {
			this.set({ sync: null });
			await this.fail(error);
		}
	}

	/**
	 * what the way through the wall does once it is through it.
	 *
	 * The session is remembered where the settings page reads it, and the held API context is
	 * dropped: it was built while nobody was signed in, so it belongs to nobody, nothing else
	 * rebuilds it, and it outlives this screen by the whole run of the process.
	 */
	rememberSession() {
		const { sync } = this.#snapshot;

		if (sync) {
			this.ports.cache.rememberRemoteSync(sync);
		}

		this.ports.cache.forgetContext();
	}

	async enterApplication() {
		try {
			this.set({ state: 'loading' });
			await this.continue();
		} catch (error) {
			await this.fail(error);

			return;
		}

		// the owner's machine keeps the organization's credentials from lapsing. It is best effort
		// and fired here rather than awaited: it reaches Turso, and entering the application must not
		// wait on a network or fail with it, which is what lets sign-in work offline (requirement 18).
		// A machine that is not the owner's, or has nothing due, does nothing.
		void this.ports.organization.renewDue().catch(() => {});
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

		this.set({ state: 'loading', error: null });

		if (prepare) {
			this.ports.reportStage('prepare');

			try {
				await prepare();
			} catch {
				// said by the `prepare`. The pass ends at its first stage, so the next one the
				// no-workspace surface starts is not counted as its continuation.
				this.ports.reportComplete();
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
			this.set({ organization: await this.ports.organization.getState() });
		} catch (error) {
			this.set({ state: before, ...this.describe(error) });

			return;
		}

		// **A workspace that fails to open is the ordinary failure, on the error screen** (effort
		// 854, requirement 10), as it is at launch: the loading surface is already up, and a throw
		// out of here left it up with nothing left to load.
		try {
			this.rememberSession();

			if (!(await this.admit())) {
				return;
			}

			if (!(await this.hasWorkspace())) {
				return;
			}
		} catch (error) {
			await this.fail(error);

			return;
		}

		await this.enterApplication();
	}
}
