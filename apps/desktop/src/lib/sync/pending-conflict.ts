import type {
	GoogleDriveConflictResolution,
	GoogleDriveLinkConflict,
	GoogleDriveLinkPreparation,
	GoogleDriveSyncOutcome,
	RemoteSyncState
} from '$lib/platform/tauri';
import { shouldDeferWorkspaceConflict } from '$lib/sync/workspace';

/** what settling a conflict actually does, injected so the sequence can be exercised without an account. */
export type PendingConflictDriver = {
	/** carry out the user's choice. */
	resolve: (
		preparation: GoogleDriveLinkPreparation,
		resolution: GoogleDriveConflictResolution
	) => Promise<GoogleDriveSyncOutcome>;
	/** undo a link the user has decided against. */
	cancel: () => Promise<RemoteSyncState>;
	/** clear a workspace whose remote can no longer be reached, so it can be linked again. */
	reset: (state: RemoteSyncState) => Promise<RemoteSyncState>;
};

/** what dismissing did. `deferred` means the conflict was only set aside; nothing was undone. */
export type PendingConflictDismissal = {
	deferred: boolean;
	state: RemoteSyncState | null;
};

/**
 * what the workspace's conflict is about, as a value that changes when it does.
 *
 * Dismissing is remembered against this rather than against the conflict, because
 * the question the user answered was about a state and not about a particular
 * reading of it: the same divergence inspected twice is one conflict, and a remote
 * that has moved since is a different one they have not been asked about.
 *
 * `null` for a workspace that is not on Drive — there is nothing to describe.
 */
export function workspaceConflictSignature(state: RemoteSyncState | null): string | null {
	const workspace = state?.workspace;

	// a pending conflict is a Drive shape: two whole snapshots that disagree and a user asked
	// to choose. A hosted workspace has neither half of that, so it has none to hold.
	if (!workspace || workspace.provider !== 'googleDrive') {
		return null;
	}

	const account = workspace.accountId
		? (state?.accounts.find((candidate) => candidate.id === workspace.accountId) ?? null)
		: null;

	return [
		workspace.id,
		workspace.accountId ?? '',
		account?.status ?? '',
		account?.lastError ?? '',
		workspace.lastSnapshotAt ?? '',
		workspace.lastSyncedAt ?? '',
		workspace.lastRemoteUpdatedAt ?? '',
		workspace.remoteHeadFileId ?? '',
		workspace.remoteHeadRevision ?? ''
	].join(':');
}

/**
 * The conflict waiting on the user, owned in one place.
 *
 * A conflict has three sources — a link the two sides disagree about, an inspection
 * at startup, and a sync that cannot proceed on its own — and outlives all of them,
 * which is why it is a longer-lived owner than the link session rather than a piece
 * of it. Every screen that can present one presents the same one, and settling it
 * anywhere settles it everywhere.
 *
 * The operations return their outcome rather than announcing it, because each is
 * started by a user pressing something and finishes when it is awaited. What each
 * host does with it is still its own: startup drives a state machine and a window,
 * settings toasts and invalidates its queries. A host whose own work follows the
 * remote's reply hands that work in rather than running it after, so the question it
 * answers stays presented until the work is done — this owner holds the question
 * open and still drives nobody's screen.
 *
 * Holds no reactivity of its own; {@link PendingConflictFlow.observe} notifies a
 * wrapper that does.
 */
export class PendingConflictFlow {
	#driver: PendingConflictDriver;
	#observers = new Set<() => void>();

	#preparation: GoogleDriveLinkPreparation | null = null;
	#dismissedSignature: string | null = null;
	#isWorking = false;

	constructor(driver: PendingConflictDriver) {
		this.#driver = driver;
	}

	/** the whole answer the conflict came with, needed to settle it. */
	get preparation() {
		return this.#preparation;
	}

	/** what the user is being asked, or `null` if nothing is pending. */
	get conflict(): GoogleDriveLinkConflict | null {
		return this.#preparation?.conflict ?? null;
	}

	/** true while a resolution, a dismissal, or a relink is outstanding. */
	get isWorking() {
		return this.#isWorking;
	}

	/** register a listener called after every state change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);
		return () => this.#observers.delete(observer);
	}

	/** whether the user has already set this state aside. */
	isDismissed(signature: string | null) {
		return signature !== null && signature === this.#dismissedSignature;
	}

	/**
	 * raise a conflict the user has not already set aside, and say whether it was
	 * raised. A preparation needing no resolution clears whatever was pending: the
	 * state it was about has been settled by something else.
	 */
	present(preparation: GoogleDriveLinkPreparation | null) {
		if (!preparation?.requiresResolution) {
			this.#preparation = null;
			this.#notify();
			return false;
		}

		if (this.isDismissed(workspaceConflictSignature(preparation.state))) {
			return false;
		}

		this.#preparation = preparation;
		this.#notify();

		return true;
	}

	/** drop what is pending without settling it. */
	clear() {
		this.#preparation = null;
		this.#notify();
	}

	/**
	 * forget that anything was dismissed, so the next inspection may ask again.
	 *
	 * What the user does deliberately reopens the question: pressing Link or Sync
	 * asks for an answer about now, not the one they waved away earlier.
	 */
	forget() {
		this.#dismissedSignature = null;
	}

	/**
	 * carry out the user's choice. Resolves to `null` where there was nothing to settle.
	 *
	 * `settle` is what the caller does with the answer, and it runs with the question still
	 * presented and this flow still reporting that it is working — so a host whose own work
	 * follows the remote's reply does not fall back to whatever it shows when nothing is
	 * pending for the length of it. A caller with nothing to do afterwards passes none.
	 */
	async resolve(
		resolution: GoogleDriveConflictResolution,
		settle?: (outcome: GoogleDriveSyncOutcome) => Promise<void>
	) {
		const preparation = this.#preparation;

		if (!preparation || this.#isWorking) {
			return null;
		}

		return await this.#working(async () => {
			const result = await this.#driver.resolve(preparation, resolution);

			this.#dismissedSignature = null;

			return await this.#settled(result, settle);
		});
	}

	/**
	 * set the conflict aside.
	 *
	 * A conflict that can be lived with is remembered against the state it describes
	 * and nothing is undone — the workspace still works, and asking again on the next
	 * inspection would be asking the same question the user just answered. A link the
	 * user has decided against has no such state to return to, so it is undone.
	 *
	 * What is remembered is the signature of the state the conflict came with, not of
	 * whatever the screen happens to be showing — two screens deriving it separately
	 * is two answers to the question this owner exists to have one answer to.
	 *
	 * `settle` is the caller's own work, run on either outcome with the question still
	 * presented, as {@link PendingConflictFlow.resolve}'s is.
	 */
	async dismiss(
		settle?: (dismissal: PendingConflictDismissal) => Promise<void>
	): Promise<PendingConflictDismissal | null> {
		const preparation = this.#preparation;

		if (!preparation || this.#isWorking) {
			return null;
		}

		if (shouldDeferWorkspaceConflict(preparation)) {
			this.#dismissedSignature = workspaceConflictSignature(preparation.state);

			return await this.#working(() => this.#settled({ deferred: true, state: null }, settle));
		}

		return await this.#working(async () => {
			const state = await this.#driver.cancel();

			return await this.#settled({ deferred: false, state }, settle);
		});
	}

	/**
	 * clear a workspace whose remote is no longer the one it was linked to, leaving
	 * it ready to be linked again. The link itself is the caller's — it is the one
	 * holding a session.
	 */
	async relink() {
		const preparation = this.#preparation;

		if (preparation?.conflict?.kind !== 'relink' || this.#isWorking) {
			return null;
		}

		return await this.#working(async () => {
			const state = await this.#driver.reset(preparation.state);

			this.#dismissedSignature = null;
			this.#preparation = null;

			return state;
		});
	}

	/**
	 * hand the answer to the caller's own work, then stop presenting the question.
	 *
	 * The clearing is in a `finally` because the remote has already acted by this point:
	 * the question is answered whatever the caller's work does with the answer, and a host
	 * whose continuation failed shows its own failure rather than the question again.
	 */
	async #settled<T>(answer: T, settle?: (answer: T) => Promise<void>) {
		const settling = this.#preparation;

		try {
			await settle?.(answer);
		} finally {
			// what stops being presented is the question that was answered, and not whatever is
			// pending when the work finishes: a continuation that raised a new one keeps it.
			if (this.#preparation === settling) {
				this.#preparation = null;
			}
		}

		return answer;
	}

	/**
	 * run an operation with the interface told it is busy, leaving what is pending
	 * alone if it fails — a conflict the remote refused to settle is still a
	 * conflict, and the user has to be able to answer it again.
	 */
	async #working<T>(operation: () => Promise<T>) {
		this.#isWorking = true;
		this.#notify();

		try {
			return await operation();
		} finally {
			this.#isWorking = false;
			this.#notify();
		}
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}
