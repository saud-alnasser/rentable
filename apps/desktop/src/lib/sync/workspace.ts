import type { QueryClient } from '@tanstack/svelte-query';

import api from '$lib/api/caller';
import { invalidateRoot } from '$lib/design/query';
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
	/**
	 * whether the pull brought another device's writes.
	 *
	 * **The caller has work to do only when this is `true`**: derived state is computed from rows,
	 * so rows that arrived from elsewhere have to be reconciled and the query cache told about it.
	 * That announcement is the fourth writer [[rules/data]], under *Query cache*, enumerates, and
	 * the enumeration being complete is what `staleTime: Infinity` rests on.
	 */
	received: boolean;
	/**
	 * whether this machine's writes reached the remote.
	 *
	 * **`false` is what a retry is armed on.** A push that could not go is not a failure — the
	 * writes stay captured and go with the next one — but *something* has to be that next one, and
	 * without this the only things that ever push are the next mutation and the next launch. A
	 * machine on a network with no upstream would hold a payment until its owner wrote something
	 * else.
	 */
	pushed: boolean;
};

/**
 * What a dispatch owes when its pull brought another device's rows.
 *
 * **Here rather than at each caller, because there are three of them and two had dropped it.** A
 * pull is a writer of workspace data, and the query cache is `staleTime: Infinity` — kept truthful
 * by every writer announcing itself, which is a policy that rests on the enumeration being complete
 * rather than short. A caller that took `received` and did nothing with it was an unannounced
 * writer, and what that shows a user is wrong data rather than slow data.
 *
 * **Reconcile before invalidate.** Derived statuses are computed from rows, so invalidating first
 * would refetch the rows and recompute them afterwards, showing the stale statuses for a frame.
 *
 * Answers when the reconcile ran, because it was a whole-table pass and the caller tracking the
 * day's reconcile should not run a second one.
 */
export async function announceReceivedRows(client: QueryClient): Promise<number> {
	const { reconciledAt } = await api.app.state.reconcile();

	await invalidateRoot(client);

	return reconciledAt;
}

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
 * **This is also where the replica pushes and pulls, since #617.** It read *nothing is sent from
 * here — a replica pushes its own writes*, which described a library that does not exist:
 * `turso::sync` captures every write and holds it until something calls `push`, so while nothing
 * called it, nothing ever left the machine. The dispatch is where it belongs rather than where it
 * ended up: the `autosync` middleware already says which procedures are mutations, and the sync
 * manager already coalesces them, retries on a widening delay and fires when the network returns.
 * Inferring a write from SQL in Rust would be guessing at something this layer declares.
 *
 * **Nothing is snapshotted and nothing is cleared on either side of the branch.** An expiry that
 * cost somebody an unsynced write is the failure acceptance criterion 16 exists to catch, and a
 * push that could not reach the remote leaves the write captured for the next one.
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
		return { state: syncState, action: 'none', received: false, pushed: true };
	}

	// A renewal that could not happen leaves the state exactly as it was, so the fallback is the
	// state this dispatch was given rather than an error path.
	const renewed = await tauri.remoteSync.renewSession().catch(() => syncState);
	const standing = workspaceReplicationStanding(renewed);

	if (standing.kind === 'signInRequired') {
		// **Nothing is replicated on a closed window, and nothing is discarded either.** What this
		// machine wrote stays captured; when somebody signs in again the next push carries it.
		// `pushed` is `true` because there is nothing to retry against a window that has closed —
		// a retry ladder here would be asking a question only a sign-in answers.
		return { state: renewed, action: 'signInRequired', received: false, pushed: true };
	}

	// Offline is the ordinary case, so a replication that could not happen is reported rather than
	// thrown: the window is unchanged and the writes are still captured. What the caller does with
	// it is arm a retry, which is why the two halves are answered separately.
	const replication = await tauri.remoteSync
		.replicate()
		.catch(() => ({ pushed: false, received: false }));

	return { state: renewed, action: 'none', ...replication };
}

/**
 * the last dispatch of a session.
 *
 * **It replicates like any other dispatch, and being the last one is why that matters.** A machine
 * closing with writes it has not sent should offer them before the window goes; what cannot be sent
 * stays captured in the replica and goes with the first push after the next sign-in.
 *
 * *It read "nothing leaves on this call any more — the replica has been pushing all along", which
 * described a library that does not exist: `turso::sync` holds every write until something calls
 * `push`.*
 */
export async function syncWorkspaceBeforeExit(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const syncState = providedState ?? (await tauri.remoteSync.getState());

	if (!syncState.controlPlaneReady) {
		return { state: syncState, action: 'none', received: false, pushed: true };
	}

	const renewed = await tauri.remoteSync.renewSession().catch(() => syncState);
	const standing = workspaceReplicationStanding(renewed);

	if (standing.kind === 'signInRequired') {
		return { state: renewed, action: 'signInRequired', received: false, pushed: true };
	}

	// **It pushes and does not pull.** A pull on the way out fetches rows into a window that is
	// closing, with nothing left to render them and a round trip standing between the person and
	// the application shutting. What must not be skipped is the offer of what they wrote.
	const pushed = await tauri.remoteSync.push().catch(() => false);

	return { state: renewed, action: 'none', received: false, pushed };
}
