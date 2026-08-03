import api from '$lib/api/caller';
import { tauri, type GoogleDriveLinkPreparation, type RemoteSyncState } from '$lib/platform/tauri';
import { toTauriErrorCode } from '$lib/error/tauri';

/**
 * whether a rejection is the user having abandoned a link rather than something
 * to report. Rust says so with a code, so the branch does not read prose.
 */
export function isGoogleDriveLinkCancellation(error: unknown) {
	return toTauriErrorCode(error) === 'cancelled';
}

/**
 * link the workspace to a Google account, from the consent screen to the
 * question the remote's contents raise.
 *
 * Outstanding for as long as the user takes. The workspace is linked either way;
 * the preparation says whether anything may transfer yet.
 */
export function linkGoogleDriveWorkspace(): Promise<GoogleDriveLinkPreparation> {
	return tauri.remoteSync.googleDrive.link();
}

/**
 * abandon the link that is outstanding, and undo one already recorded.
 *
 * Reconciles afterwards because the workspace the derived statuses were computed
 * against is no longer the one the application is on.
 */
export async function cancelGoogleDriveLink(): Promise<RemoteSyncState> {
	const state = await tauri.remoteSync.googleDrive.cancelLinkAttempt();
	await api.app.state.reconcile();

	return state;
}

/**
 * disconnect the workspace from Google Drive, keeping one current snapshot of it
 * on this machine.
 *
 * Reconciles first so that snapshot holds settled statuses rather than stale
 * ones, and again afterwards for the same reason a cancellation does.
 */
export async function unlinkGoogleDriveWorkspace(): Promise<RemoteSyncState> {
	await api.app.state.reconcile();
	const state = await tauri.remoteSync.googleDrive.unlink();
	await api.app.state.reconcile();

	return state;
}
