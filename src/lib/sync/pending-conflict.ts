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
 * host does afterwards is its own: startup drives a state machine and a window,
 * settings toasts and invalidates its queries.
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

	/** carry out the user's choice. Resolves to `null` where there was nothing to settle. */
	async resolve(resolution: GoogleDriveConflictResolution) {
		const preparation = this.#preparation;

		if (!preparation || this.#isWorking) {
			return null;
		}

		return await this.#working(async () => {
			const result = await this.#driver.resolve(preparation, resolution);

			this.#dismissedSignature = null;
			this.#preparation = null;

			return result;
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
	 */
	async dismiss(): Promise<PendingConflictDismissal | null> {
		const preparation = this.#preparation;

		if (!preparation || this.#isWorking) {
			return null;
		}

		if (shouldDeferWorkspaceConflict(preparation)) {
			this.#dismissedSignature = workspaceConflictSignature(preparation.state);
			this.#preparation = null;
			this.#notify();

			return { deferred: true, state: null };
		}

		return await this.#working(async () => {
			const state = await this.#driver.cancel();

			this.#preparation = null;

			return { deferred: false, state };
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
