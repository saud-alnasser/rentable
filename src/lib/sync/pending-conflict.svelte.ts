import { inverseStack } from '$lib/design/inverse';
import {
	tauri,
	type GoogleDriveConflictResolution,
	type GoogleDriveLinkPreparation,
	type GoogleDriveSyncOutcome
} from '$lib/platform/tauri';

import { cancelGoogleDriveLink } from './link';
import {
	PendingConflictFlow,
	type PendingConflictDismissal,
	type PendingConflictDriver
} from './pending-conflict';

/**
 * settling a conflict against the account it is about.
 *
 * Every one of these is a single command: Rust reads the remote again, carries
 * the choice out, and reports what happened. Relinking is the unlink this
 * application already has — a remote that turned out to hold a different
 * workspace is not this one's to empty, so nothing there is touched and the
 * user links again from a workspace that is local once more.
 *
 * A resolution that pulls replaces the local database, so the session's inverses
 * go with it: each is a statement about the workspace that was here (ADR 0026).
 * This command reaches Rust directly rather than through the sync path, so it
 * carries the clearing itself.
 */
const googleDrivePendingConflictDriver: PendingConflictDriver = {
	resolve: async (_preparation, resolution) => {
		const result = await tauri.remoteSync.googleDrive.resolveConflict({ resolution });

		if (result.action === 'pulled') {
			inverseStack.clear();
		}

		return result;
	},
	cancel: () => cancelGoogleDriveLink(),
	reset: () => tauri.remoteSync.googleDrive.unlink()
};

/**
 * The reactive face of {@link PendingConflictFlow}. Owns nothing but the mirrors —
 * every decision is the flow's, so what a screen reads here and what the tests
 * exercise there cannot drift apart.
 */
class PendingConflict {
	#flow: PendingConflictFlow;

	preparation = $state<GoogleDriveLinkPreparation | null>(null);
	isWorking = $state(false);

	/** what the user is being asked, or `null` if nothing is pending. */
	conflict = $derived(this.preparation?.conflict ?? null);

	constructor(driver: PendingConflictDriver = googleDrivePendingConflictDriver) {
		this.#flow = new PendingConflictFlow(driver);

		this.#flow.observe(() => {
			this.preparation = this.#flow.preparation;
			this.isWorking = this.#flow.isWorking;
		});
	}

	isDismissed = (signature: string | null) => this.#flow.isDismissed(signature);

	present = (preparation: GoogleDriveLinkPreparation | null) => this.#flow.present(preparation);

	clear = () => this.#flow.clear();

	forget = () => this.#flow.forget();

	resolve = (
		resolution: GoogleDriveConflictResolution,
		settle?: (outcome: GoogleDriveSyncOutcome) => Promise<void>
	) => this.#flow.resolve(resolution, settle);

	dismiss = (settle?: (dismissal: PendingConflictDismissal) => Promise<void>) =>
		this.#flow.dismiss(settle);

	relink = () => this.#flow.relink();
}

/**
 * the one pending conflict, for the life of the application.
 *
 * A module rather than a per-screen instance because the conflict outlives every
 * screen that can raise it: linking raises one, so does inspecting a workspace at
 * startup, and so does a sync that cannot proceed on its own. Two owners would mean
 * two answers to the same question — which is what dismissing used to be.
 */
export const pendingConflict = new PendingConflict();
