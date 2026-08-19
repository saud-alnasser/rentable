import api from '$lib/api/caller';
import { inverseStack } from '$lib/design/inverse';
import {
	tauri,
	type GoogleDriveLinkPreparation,
	type GoogleDriveSyncAction,
	type RemoteSyncState,
	type RemoteSyncWorkspace
} from '$lib/platform/tauri';
import { enqueueGoogleDriveOperation } from '$lib/sync/queue';
import { workspaceReplicationStanding } from '$lib/sync/session';

/**
 * what a dispatch did, or declined to do.
 *
 * `signInRequired` is the third kind and it is neither a success nor a failure: the workspace is
 * of record somewhere else, the three-day window closed with no contact, and replication is off
 * until somebody signs in again. It is an *answer* rather than a thrown error because nothing
 * went wrong — waiting does not settle it and retrying does not either, so a caller that treated
 * it as a failure would retry forever and say nothing useful.
 */
export type WorkspaceSyncAction = GoogleDriveSyncAction | 'autosaved' | 'signInRequired';

export type WorkspaceSyncResult = {
	state: RemoteSyncState;
	action: WorkspaceSyncAction;
	preparation: GoogleDriveLinkPreparation | null;
};

export type WorkspaceRemoteSyncResult = Omit<WorkspaceSyncResult, 'action'> & {
	action: GoogleDriveSyncAction | 'signInRequired';
};

/**
 * what a hosted workspace's dispatch amounts to, after trying to renew.
 *
 * **Renewing first is what makes *any connection inside the window renews it* a thing the
 * application does** rather than a thing the control plane would do if anybody called it. This
 * runs on every dispatch, and the autosync manager already schedules those on a timer and on the
 * machine coming back online — so a client that is doing anything at all stays signed in without
 * anybody thinking about it. Being offline is not a failure: the window stays where it was and
 * this goes on to read it.
 *
 * One reading, used by both dispatchers, so the two cannot answer the window differently.
 * Nothing is written, nothing is snapshotted and nothing is cleared on either side of the
 * branch — an expiry that cost somebody an unsynced write would be the failure this ticket's
 * third criterion exists to catch.
 */
async function hostedOutcome(syncState: RemoteSyncState): Promise<WorkspaceSyncResult> {
	// A renewal that could not happen leaves the state exactly as it was, so the fallback is the
	// state this dispatch was given rather than an error path.
	const renewed = await tauri.remoteSync.renewSession().catch(() => syncState);
	const standing = workspaceReplicationStanding(renewed);

	return {
		state: renewed,
		action: standing.kind === 'signInRequired' ? 'signInRequired' : 'none',
		preparation: null
	};
}

export function getWorkspaceFromSyncState(
	syncState?: RemoteSyncState | null
): RemoteSyncWorkspace | null {
	return syncState?.workspace ?? null;
}

/**
 * whether to offer the fork between keeping the workspace on this machine and putting it
 * somewhere it can be reached from another.
 *
 * A workspace that has already been put somewhere — Drive or hosted — has answered the
 * question, so only a `local` one is asked. **`hosted` is not merely "not local" here**: it is
 * an answer, and re-asking somebody who has given one is the defect this reads for.
 */
export function shouldChooseWorkspaceMode(syncState?: RemoteSyncState | null) {
	const workspace = getWorkspaceFromSyncState(syncState);
	return Boolean(syncState?.googleDriveReady && workspace?.provider === 'local');
}

export function shouldDeferWorkspaceConflict(preparation?: GoogleDriveLinkPreparation | null) {
	const kind = preparation?.conflict?.kind;
	return kind === 'sync' || kind === 'corrupt' || kind === 'relink';
}

/**
 * ask what the remote holds, and whether the two sides can be reconciled without
 * the user. `null` where the workspace is not on a remote that can diverge.
 *
 * The reading is Rust's and the argument is not passed on: what the remote holds
 * is read there, against the state it holds there, so a caller cannot ask about
 * a workspace the application is no longer on.
 */
export async function inspectWorkspaceSyncState(syncState: RemoteSyncState) {
	const workspace = getWorkspaceFromSyncState(syncState);

	// a hosted workspace answers `null` for a different reason than a local one, and the
	// reason is worth keeping: there is nothing to inspect because the two sides do not hold
	// whole snapshots to compare. Divergence there is resolved per column as it arrives, not
	// reported to the user as a choice between two files.
	if (workspace?.provider !== 'googleDrive' || !syncState.googleDriveReady) {
		return null;
	}

	return await tauri.remoteSync.googleDrive.inspect();
}

/**
 * exchange this workspace with wherever it is kept.
 *
 * `autosaveLocal` says what an unlinked workspace means here: a snapshot on this
 * machine, or nothing at all. The two callers differ — closing the application
 * takes one, a mutation does not.
 */
export async function syncWorkspaceNow(
	providedState?: RemoteSyncState | null,
	options: { manual?: boolean; autosaveLocal?: boolean } = {}
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());
	const workspace = getWorkspaceFromSyncState(syncState);

	if (!workspace) {
		return { state: syncState, action: 'none', preparation: null };
	}

	if (workspace.provider === 'local') {
		if (!options.autosaveLocal) {
			return { state: syncState, action: 'none', preparation: null };
		}

		const state = await tauri.remoteSync.autosaveNow();
		return { state, action: 'autosaved', preparation: null };
	}

	// A hosted workspace's replica pushes on its own rather than on this call, so there is
	// nothing for the dispatcher to do — the transport that makes that true is #548, and until
	// it lands this branch is what a hosted workspace gets: nothing, said explicitly, rather
	// than a Drive sync it has no account for.
	//
	// What it does answer for is the window (#550). Past three days with no contact the session
	// is gone and replication stops until somebody signs in again — and the workspace is left
	// exactly as it is, because the refusal is a decision not to send rather than anything done
	// to what is here.
	if (workspace.provider === 'hosted') {
		return await hostedOutcome(syncState);
	}

	if (workspace.provider !== 'googleDrive' || !syncState.googleDriveReady) {
		return { state: syncState, action: 'none', preparation: null };
	}

	return await syncGoogleDriveWorkspace({ manual: options.manual });
}

export async function syncWorkspaceRemoteNow(
	providedState?: RemoteSyncState | null,
	options: { manual?: boolean } = {}
): Promise<WorkspaceRemoteSyncResult> {
	const result = await syncWorkspaceNow(providedState, {
		manual: options.manual,
		autosaveLocal: false
	});

	return {
		state: result.state,
		action: result.action === 'autosaved' ? 'none' : result.action,
		preparation: result.preparation
	};
}

/**
 * the last sync of a session. Derived statuses are recomputed first, so what
 * leaves this machine is the workspace as it will be read back.
 */
export async function syncWorkspaceBeforeExit(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());
	const workspace = getWorkspaceFromSyncState(syncState);

	if (!workspace) {
		return { state: syncState, action: 'none', preparation: null };
	}

	if (workspace.provider === 'googleDrive' && syncState.googleDriveReady) {
		await api.app.state.reconcile();

		return await syncGoogleDriveWorkspace({});
	}

	if (workspace.provider === 'local') {
		const state = await tauri.remoteSync.autosaveNow();
		return { state, action: 'autosaved', preparation: null };
	}

	if (workspace.provider === 'hosted') {
		return await hostedOutcome(syncState);
	}

	// Drive with the account not ready. It takes no local snapshot: it is waiting on a
	// credential rather than on a copy.
	return { state: syncState, action: 'none', preparation: null };
}

/**
 * the coarse sync, and the one thing it cannot do for itself.
 *
 * Derived statuses are recomputed after a pull because the database was replaced
 * underneath them — the derivation is this layer's, and Rust neither owns it nor
 * can run it. The session's inverses go for the same reason and cannot be
 * recomputed: each is a statement about the database that was here before.
 */
async function syncGoogleDriveWorkspace(options: {
	manual?: boolean;
}): Promise<WorkspaceRemoteSyncResult> {
	const outcome = await enqueueGoogleDriveOperation(() =>
		tauri.remoteSync.googleDrive.sync({ manual: options.manual })
	);

	if (outcome.action === 'pulled') {
		inverseStack.clear();
		await api.app.state.reconcile();
	}

	return outcome;
}
