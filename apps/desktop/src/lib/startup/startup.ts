import { WindowClose } from './close';
import { applySyncOutcome, type SyncOutcome } from './heartbeat';
import { StartupMachine } from './machine';
import type { StartupPorts } from './ports';
import type { StartupSnapshot } from './snapshot';
import { switchWorkspace } from './switch';
import { linkRefused, remove, select, signIn, signOut } from './wall';

export type { SyncOutcome } from './heartbeat';
export type { StartupPorts } from './ports';
export {
	hasRecoveryData,
	type SignInReason,
	type StartupSnapshot,
	type StartupState
} from './snapshot';

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
 * this unit is for is being driven with no window, the way `sync/admission.ts` already is.
 *
 * **Plain, and not `.svelte.ts`.** A runes file cannot be imported by a `node:test` at all, which
 * is the whole reason the state here is an ordinary object with observers rather than `$state`.
 * The shell subscribes and mirrors it; that mirroring is the only reactive thing left in the
 * route.
 *
 * **Every reach outside itself is a port** (`./ports`). Not for indirection's sake: each one is a
 * thing that is absent in a test process, and naming them is what lets a test say *this launch
 * has no account* rather than mock a global.
 *
 * **This is what the shell holds, and each concern is its own file.** The state and the pass every
 * way in ends on are `./machine`; the wall's sign-in, sign-out and forget are `./wall`; a switch
 * between workspaces is `./switch`; what a sync heartbeat owes is `./heartbeat`; the whole-table
 * passes are `./reconcile`; and the close that syncs first is `./close`. Each method here hands
 * over to one of them, and the reasons for what each does are written there.
 */
export class Startup {
	#machine: StartupMachine;
	#close: WindowClose;

	constructor(ports: StartupPorts) {
		this.#machine = new StartupMachine(ports);
		this.#close = new WindowClose(this.#machine);
	}

	/** what the shell draws. A copy, so nothing outside this unit can write to it. */
	get snapshot(): StartupSnapshot {
		return this.#machine.snapshot;
	}

	/** register a listener called after every change. Returns its own removal. */
	observe(observer: (snapshot: StartupSnapshot) => void) {
		return this.#machine.observe(observer);
	}

	/** Start the application. What the shell calls once, on mount. */
	start() {
		return this.#machine.start();
	}

	/** Sign in at the wall, by username and password, and go straight on in (`./wall`). */
	signIn(username: string, password: string) {
		return signIn(this.#machine, username, password);
	}

	/** Try the whole startup again. What the failure and recovery screens offer. */
	retry() {
		return this.start();
	}

	/** Where the machine stands changed under the shell: read it again and go on (`./machine`). */
	standingChanged(passing?: { prepare?: () => Promise<unknown>; arrive?: () => Promise<unknown> }) {
		return this.#machine.standingChanged(passing);
	}

	/** A link was refused: read where the machine stands again, in place, under it (`./wall`). */
	linkRefused() {
		return linkRefused(this.#machine);
	}

	/**
	 * Open another of the workspaces the member holds, from inside the application (`./switch`).
	 * `arrive` moves the address first, under the loading page.
	 */
	switchWorkspace(workspaceId: string, passing?: { arrive?: () => Promise<unknown> }) {
		return switchWorkspace(this.#machine, workspaceId, passing);
	}

	/**
	 * Somebody signed out, here or on another window (`./wall`): the wall goes up at once, and
	 * `arrive` moves the address off one that opens signed out behind it.
	 */
	signOut(passing?: { arrive?: () => Promise<unknown> }) {
		return signOut(this.#machine, passing);
	}

	/**
	 * Choose the organization the wall opens on, at the switcher (`./wall`). `isCreating` is the
	 * no-workspace screen's create running, which nothing is chosen under.
	 */
	select(organizationId: string, busy?: { isCreating?: boolean }) {
		return select(this.#machine, organizationId, busy);
	}

	/** Forget one organization this machine holds, after the switcher's confirm (`./wall`). */
	remove(organizationId: string, busy?: { isCreating?: boolean }) {
		return remove(this.#machine, organizationId, busy);
	}

	/** What a sync manager reported (`./heartbeat`). */
	applySyncOutcome(outcome: SyncOutcome) {
		return applySyncOutcome(this.#machine, outcome);
	}

	/** Recompute what the date decides, where the date has moved under it (`./reconcile`). */
	reconcileOnDayCrossing() {
		return this.#machine.reconciliation.onDayCrossing(this.#machine.current.state === 'ready');
	}

	/** whether the window may close without syncing first, which is every state but `ready`. */
	get closesWithoutSyncing() {
		return this.#machine.current.state !== 'ready';
	}

	/** Hide the window, push what this machine holds, then close (`./close`). */
	closeWindow(skipSync = false) {
		return this.#close.close(skipSync);
	}

	/** whether a close is already past the point of being interrupted. */
	get isClosing() {
		return this.#close.isClosing;
	}
}

export const createStartup = (ports: StartupPorts) => new Startup(ports);
