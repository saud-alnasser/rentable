import type { QueryClient } from '@tanstack/svelte-query';

import api from '$lib/api/caller';
import { invalidateRoot } from '$lib/design/query';
import {
	tauri,
	type RemoteSyncState,
	type RemoteSyncWorkspace,
	type ReplicationRefusal
} from '$lib/platform/tauri';

/**
 * what a dispatch did, or declined to do.
 *
 * **One answer, where there were five and then two.** `pushed`, `pulled` and the conflict that
 * came back beside them were Google Drive's, a whole snapshot moving one way or the other, and
 * a question for the user where neither direction was safe; Drive sync retired (decision 07) and
 * a replica resolves divergence per column as it arrives. `signInRequired` stood after that
 * while a control plane's window could close under a machine; the control plane retired, the
 * credential is the vault's, and a replication that is refused says why on `refusal` instead.
 */
export type WorkspaceSyncAction = 'none';

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
	/** why a half did not go, where Turso said: the account's, the credential's, or neither. */
	refusal: ReplicationRefusal;
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
 * push and pull the replica, and say what each half did.
 *
 * **This is where the replica pushes and pulls, since #617.** It read *nothing is sent from
 * here — a replica pushes its own writes*, which described a library that does not exist:
 * `turso::sync` captures every write and holds it until something calls `push`, so while nothing
 * called it, nothing ever left the machine. The dispatch is where it belongs rather than where it
 * ended up: the `autosync` middleware already says which procedures are mutations, and the sync
 * manager already coalesces them, retries on a widening delay and fires when the network returns.
 * Inferring a write from SQL in Rust would be guessing at something this layer declares.
 *
 * **Nothing stands in front of the replication any more.** A control plane's window was renewed
 * on every dispatch until the retirement; the credential the replica syncs with is the one the
 * member's vault unsealed, and what refuses it is Turso, which the shell reads at the response
 * and collects a fresh one on (`organization/removal.rs`). Offline is the ordinary case, so a
 * replication that could not happen is reported rather than thrown, and what the caller does
 * with it is arm a retry, which is why the two halves are answered separately.
 *
 * **Nothing is snapshotted and nothing is cleared on either side.** A push that could not reach
 * the remote leaves the write captured for the next one.
 */
export async function syncWorkspaceNow(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const state = providedState ?? (await tauri.remoteSync.getState());
	const replication = await tauri.remoteSync
		.replicate()
		.catch(() => ({ pushed: false, received: false, refusal: 'none' as const }));

	return { state, action: 'none', ...replication };
}

/**
 * the last dispatch of a session.
 *
 * **It pushes and does not pull.** A pull on the way out fetches rows into a window that is
 * closing, with nothing left to render them and a round trip standing between the person and
 * the application shutting. What must not be skipped is the offer of what they wrote; what
 * cannot be sent stays captured in the replica and goes with the first push after the next
 * sign-in.
 */
export async function syncWorkspaceBeforeExit(
	providedState?: RemoteSyncState | null
): Promise<WorkspaceSyncResult> {
	const state = providedState ?? (await tauri.remoteSync.getState());
	const pushed = await tauri.remoteSync.push().catch(() => false);

	return { state, action: 'none', received: false, pushed, refusal: 'none' };
}
