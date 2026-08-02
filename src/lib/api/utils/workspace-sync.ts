import {
	tauri,
	type GoogleDriveLinkPreparation,
	type RemoteSyncState,
	type RemoteSyncWorkspace
} from '$lib/api/tauri';
import {
	inspectGoogleDriveSyncState,
	syncActiveGoogleDriveProfile,
	syncBeforeAppExit,
	type GoogleDriveSyncResult
} from '$lib/api/utils/remote-sync-google-drive';
import {
	recordDiagnosticError,
	recordDiagnosticInfo,
	recordDiagnosticWarning
} from '$lib/diagnostics/record';
import { toErrorDetail } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';

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
		recordDiagnosticWarning('sync.deferred', {
			workspace: workspace.id,
			conflict: preparation.conflict?.kind
		});

		return { state: preparation.state, action: 'none', preparation };
	}

	try {
		const result = await syncActiveGoogleDriveProfile('sync', preparation.state, {
			manual: options.manual
		});

		recordDiagnosticInfo('sync.completed', {
			workspace: workspace.id,
			action: result.action,
			manual: options.manual
		});

		return { state: result.state, action: result.action, preparation: null };
	} catch (error) {
		recordDiagnosticError('sync.failed', {
			workspace: workspace.id,
			manual: options.manual,
			code: toTauriErrorCode(error),
			error: toErrorDetail(error)
		});

		throw error;
	}
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
		try {
			const result = await syncBeforeAppExit(syncState);

			recordDiagnosticInfo('sync.beforeExit.completed', {
				workspace: workspace.id,
				action: result.action
			});

			return { state: result.state, action: result.action, preparation: null };
		} catch (error) {
			// the last sync of a session, and the one whose failure the user is
			// least likely to see: the window is already closing.
			recordDiagnosticError('sync.beforeExit.failed', {
				workspace: workspace.id,
				code: toTauriErrorCode(error),
				error: toErrorDetail(error)
			});

			throw error;
		}
	}

	if (workspace.provider === 'local') {
		const state = await tauri.remoteSync.autosaveNow();
		return { state, action: 'autosaved', preparation: null };
	}

	return { state: syncState, action: 'none', preparation: null };
}
