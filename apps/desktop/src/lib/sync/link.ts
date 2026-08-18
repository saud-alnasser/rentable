import api from '$lib/api/caller';
import { inverseStack } from '$lib/design/inverse';
import { tauri, type GoogleDriveLinkPreparation, type RemoteSyncState } from '$lib/platform/tauri';

import { isGoogleSignInCancellation } from './sign-in';

/**
 * whether a rejection is the user having abandoned a link rather than something
 * to report.
 *
 * The same answer as {@link isGoogleSignInCancellation} and deliberately the
 * same implementation: a link that has to sign in is abandoned at the consent
 * screen, and a link that reuses an identity is abandoned in this application.
 * One code covers both, and two readings of it would drift.
 */
export function isGoogleDriveLinkCancellation(error: unknown) {
	return isGoogleSignInCancellation(error);
}

/**
 * link the workspace to a Google account, from whatever identity is available to
 * the question the remote's contents raise.
 *
 * Outstanding for as long as the user takes over a consent screen — and where
 * this machine is already signed in, no consent screen opens at all. The
 * workspace is linked either way; the preparation says whether anything may
 * transfer yet.
 */
export function linkGoogleDriveWorkspace(): Promise<GoogleDriveLinkPreparation> {
	return tauri.remoteSync.googleDrive.link();
}

/**
 * abandon the link that is outstanding, and undo one already recorded.
 *
 * Reconciles afterwards because the workspace the derived statuses were computed
 * against is no longer the one the application is on. The session's inverses are
 * dropped for the same reason, and cannot be recomputed the way statuses can.
 */
export async function cancelGoogleDriveLink(): Promise<RemoteSyncState> {
	const state = await tauri.remoteSync.googleDrive.cancelLinkAttempt();
	inverseStack.clear();
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
	inverseStack.clear();
	await api.app.state.reconcile();

	return state;
}
