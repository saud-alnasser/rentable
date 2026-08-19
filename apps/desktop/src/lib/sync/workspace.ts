import { tauri, type RemoteSyncState, type RemoteSyncWorkspace } from '$lib/platform/tauri';
import { workspaceReplicationStanding } from '$lib/sync/session';

/**
 * what a dispatch did, or declined to do.
 *
 * **Two answers, where there were five.** `pushed`, `pulled` and the conflict that came back
 * beside them were Google Drive's — a whole snapshot moving one way or the other, and a question
 * for the user where neither direction was safe. Drive sync retired (decision 07) and a replica
 * resolves divergence per column as it arrives, so there is no direction to choose and nothing to
 * ask about.
 *
 * `signInRequired` is neither a success nor a failure: the workspace is of record somewhere else,
 * the three-day window closed with no contact, and replication is off until somebody signs in
 * again. It is an *answer* rather than a thrown error because nothing went wrong — waiting does
 * not settle it and retrying does not either, so a caller that treated it as a failure would
 * retry forever and say nothing useful.
 */
export type WorkspaceSyncAction = 'none' | 'signInRequired';

export type WorkspaceSyncResult = {
	state: RemoteSyncState;
	action: WorkspaceSyncAction;
};

export function getWorkspaceFromSyncState(
	syncState?: RemoteSyncState | null
): RemoteSyncWorkspace | null {
	return syncState?.workspace ?? null;
}

/**
 * reach the control plane, and answer with what this machine may still do.
 *
 * **Renewing first is what makes *any connection inside the window renews it* a thing the
 * application does** rather than a thing the control plane would do if anybody called it. This
 * runs on every dispatch, and the sync manager schedules those on a timer and on the machine
 * coming back online — so a client that is doing anything at all stays signed in without anybody
 * thinking about it. Being offline is not a failure: the window stays where it was and this goes
 * on to read it.
 *
 * **Nothing is sent from here, and that is the shape rather than an omission.** A replica pushes
 * its own writes; what a dispatch answers for is the window. Nothing is written, nothing is
 * snapshotted and nothing is cleared on either side of the branch — an expiry that cost somebody
 * an unsynced write would be the failure acceptance criterion 16 exists to catch.
 */
export async function syncWorkspaceNow(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());

	// A build that was never told where a control plane is has nowhere to sign in to, and
	// `controlPlaneReady` is on the state so a caller can see that rather than discover it by a
	// call failing. Asking for a sign-in it cannot offer is an instruction nobody can follow —
	// and every dispatch runs through here, so it would be raised on every write.
	if (!syncState.controlPlaneReady) {
		return { state: syncState, action: 'none' };
	}

	// A renewal that could not happen leaves the state exactly as it was, so the fallback is the
	// state this dispatch was given rather than an error path.
	const renewed = await tauri.remoteSync.renewSession().catch(() => syncState);
	const standing = workspaceReplicationStanding(renewed);

	return {
		state: renewed,
		action: standing.kind === 'signInRequired' ? 'signInRequired' : 'none'
	};
}

/**
 * the last dispatch of a session.
 *
 * *It used to recompute derived statuses first, so that what left this machine was the workspace
 * as it would be read back. Nothing leaves on this call any more — the replica has been pushing
 * all along — so what is left is the window, asked one more time on the way out.*
 */
export async function syncWorkspaceBeforeExit(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	return await syncWorkspaceNow(providedState);
}
