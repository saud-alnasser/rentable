import { tauri, type RemoteSyncState, type RemoteSyncWorkspace } from '$lib/api/tauri';
import {
	inspectGoogleDriveSyncState,
	syncActiveGoogleDriveProfile,
	syncBeforeAppExit,
	type GoogleDriveLinkPreparation,
	type GoogleDriveSyncResult
} from '$lib/api/utils/remote-sync-google-drive';

export type WorkspaceSyncAction = GoogleDriveSyncResult['action'] | 'autosaved';

export type WorkspaceSyncResult = {
	state: RemoteSyncState;
	action: WorkspaceSyncAction;
	preparation: GoogleDriveLinkPreparation | null;
};

export type WorkspaceRemoteSyncResult = Omit<WorkspaceSyncResult, 'action'> & {
	action: GoogleDriveSyncResult['action'];
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

	const preparation = await inspectGoogleDriveSyncState(syncState);
	if (preparation.requiresResolution) {
		return { state: preparation.state, action: 'none', preparation };
	}

	const result = await syncActiveGoogleDriveProfile('sync', preparation.state, {
		manual: options.manual
	});

	return { state: result.state, action: result.action, preparation: null };
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

export async function syncWorkspaceBeforeExit(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());
	const workspace = getWorkspaceFromSyncState(syncState);

	if (!workspace) {
		return { state: syncState, action: 'none', preparation: null };
	}

	if (workspace.provider === 'googleDrive' && syncState.googleDriveReady) {
		const result = await syncBeforeAppExit(syncState);
		return { state: result.state, action: result.action, preparation: null };
	}

	if (workspace.provider === 'local') {
		const state = await tauri.remoteSync.autosaveNow();
		return { state, action: 'autosaved', preparation: null };
	}

	return { state: syncState, action: 'none', preparation: null };
}
