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

export type WorkspaceSyncAction = GoogleDriveSyncAction | 'autosaved';

export type WorkspaceSyncResult = {
	state: RemoteSyncState;
	action: WorkspaceSyncAction;
	preparation: GoogleDriveLinkPreparation | null;
};

export type WorkspaceRemoteSyncResult = Omit<WorkspaceSyncResult, 'action'> & {
	action: GoogleDriveSyncAction;
};

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

	// hosted, or Drive with the account not ready. Neither takes a local snapshot: the first
	// has its record of truth elsewhere already, and the second is waiting on a credential
	// rather than on a copy.
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
