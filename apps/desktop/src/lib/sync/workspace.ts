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
 * `signInRequired` is neither a success nor a failure: the workspace is
 * of record somewhere else, the three-day window closed with no contact, and replication is off
 * until somebody signs in again. It is an *answer* rather than a thrown error because nothing
 * went wrong — waiting does not settle it and retrying does not either, so a caller that treated
 * it as a failure would retry forever and say nothing useful.
 */
export type WorkspaceSyncAction = GoogleDriveSyncAction | 'signInRequired';

export type WorkspaceSyncResult = {
	state: RemoteSyncState;
	action: WorkspaceSyncAction;
	preparation: GoogleDriveLinkPreparation | null;
};

export type WorkspaceRemoteSyncResult = WorkspaceSyncResult;

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
	// A build that was never told where a control plane is has nowhere to sign in to, and
	// `controlPlaneReady` is on the state so a caller can see that rather than discover it by a
	// call failing. Asking for a sign-in it cannot offer is an instruction nobody can follow —
	// and every dispatch runs through here, so it would be raised on every write.
	//
	// This became reachable when the mode went: an unlinked workspace used to be answered as one
	// kept on this machine and never came this way at all.
	if (!syncState.controlPlaneReady) {
		return { state: syncState, action: 'none', preparation: null };
	}

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
 * whether this workspace is linked to a Google Drive folder.
 *
 * **A link, and no longer a mode.** `link_workspace_to_google_drive` in `tauri/src/sync/session.rs`
 * is the only thing in the tree that writes `accountId`, and undoing the link clears it — so this
 * says exactly what `provider === 'googleDrive'` said, without a value that also has to answer
 * *and where is this workspace of record*. Every workspace is of record in Turso; a linked one is
 * additionally still exchanging snapshots with Drive until that surface retires (#554).
 *
 * **It stops discriminating the moment a workspace names its owner rather than its Drive
 * account**, which is #565 and #567. That is why #554 is blocked by #565: Drive has to be gone
 * before `accountId` starts meaning something else, or this reads every workspace as linked.
 */
export function isGoogleDriveLinked(workspace?: RemoteSyncWorkspace | null) {
	return Boolean(workspace?.accountId);
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
	if (!isGoogleDriveLinked(workspace) || !syncState.googleDriveReady) {
		return null;
	}

	return await tauri.remoteSync.googleDrive.inspect();
}

/**
 * exchange this workspace with wherever it is kept.
 *
 * **Two arms, where there were four.** The dispatcher used to select on the mode, and the local
 * arm — take a snapshot on this machine, or do nothing — went with it: there is no workspace
 * whose record of truth is a file here, so nothing is ever exchanged with this machine. What
 * remains is a Drive-linked workspace, which still exchanges snapshots until that surface
 * retires (#554), and every other workspace, which is of record in Turso.
 *
 * A hosted workspace's replica pushes on its own rather than on this call, so there is nothing
 * for the dispatcher to do — the transport that makes that true is #548. What it does answer for
 * is the window (#550). Past three days with no contact the session is gone and replication
 * stops until somebody signs in again — and the workspace is left exactly as it is, because the
 * refusal is a decision not to send rather than anything done to what is here.
 */
export async function syncWorkspaceNow(
	providedState?: RemoteSyncState | null,
	options: { manual?: boolean } = {}
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());
	const workspace = getWorkspaceFromSyncState(syncState);

	if (!workspace) {
		return { state: syncState, action: 'none', preparation: null };
	}

	if (isGoogleDriveLinked(workspace)) {
		// linked, but this build was never told where Drive is. It waits on a credential rather
		// than on a copy, which is why it takes none.
		if (!syncState.googleDriveReady) {
			return { state: syncState, action: 'none', preparation: null };
		}

		return await syncGoogleDriveWorkspace({ manual: options.manual });
	}

	return await hostedOutcome(syncState);
}

export async function syncWorkspaceRemoteNow(
	providedState?: RemoteSyncState | null,
	options: { manual?: boolean } = {}
): Promise<WorkspaceRemoteSyncResult> {
	return await syncWorkspaceNow(providedState, { manual: options.manual });
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

	if (isGoogleDriveLinked(workspace)) {
		if (!syncState.googleDriveReady) {
			return { state: syncState, action: 'none', preparation: null };
		}

		await api.app.state.reconcile();

		return await syncGoogleDriveWorkspace({});
	}

	return await hostedOutcome(syncState);
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
