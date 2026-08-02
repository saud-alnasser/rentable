import api from '$lib/api/mod';
import {
	tauri,
	type GoogleDriveLinkPreparation,
	type GoogleDriveSyncAction,
	type RemoteSyncState,
	type RemoteSyncWorkspace
} from '$lib/api/tauri';
import { enqueueGoogleDriveOperation } from '$lib/api/utils/google-drive-operation-queue';
import { inspectGoogleDriveSyncState } from '$lib/api/utils/remote-sync-google-drive';

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

export function shouldChooseWorkspaceMode(syncState?: RemoteSyncState | null) {
	const workspace = getWorkspaceFromSyncState(syncState);
	return Boolean(syncState?.googleDriveReady && workspace?.provider === 'local');
}

export function shouldDeferWorkspaceConflict(preparation?: GoogleDriveLinkPreparation | null) {
	const kind = preparation?.conflict?.kind;
	return kind === 'sync' || kind === 'corrupt' || kind === 'relink';
}

export async function inspectWorkspaceSyncState(syncState: RemoteSyncState) {
	const workspace = getWorkspaceFromSyncState(syncState);
	if (workspace?.provider !== 'googleDrive' || !syncState.googleDriveReady) {
		return null;
	}

	return await inspectGoogleDriveSyncState(syncState);
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

	return { state: syncState, action: 'none', preparation: null };
}

/**
 * the coarse sync, and the one thing it cannot do for itself.
 *
 * Derived statuses are recomputed after a pull because the database was replaced
 * underneath them — the derivation is this layer's, and Rust neither owns it nor
 * can run it.
 */
async function syncGoogleDriveWorkspace(options: {
	manual?: boolean;
}): Promise<WorkspaceRemoteSyncResult> {
	const outcome = await enqueueGoogleDriveOperation(() =>
		tauri.remoteSync.googleDrive.sync({ manual: options.manual })
	);

	if (outcome.action === 'pulled') {
		await api.app.state.reconcile();
	}

	return outcome;
}
