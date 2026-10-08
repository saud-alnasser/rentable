import type { HeldByVersion } from '$lib/organization';

/**
 * asking for a dispatch, and hearing what one did.
 *
 * *Every name here said `googleDriveAutosync` until Drive sync retired (decision 07). What is
 * dispatched now is the replica's push and pull, so the events are named for the workspace
 * rather than for a provider that is not there.*
 */

export type WorkspaceSyncRequest = {
	immediate?: boolean;
	reason?: string;
};

export type WorkspaceSyncEventResult = {
	/**
	 * `error` is a dispatch that threw. *`signInRequired` stood beside it while a control plane's
	 * window could close under a machine (#550); the retirement took the window with it.*
	 */
	action: 'none' | 'error';
	errorMessage: string | null;
	/**
	 * whether the pull that just ran brought another device's writes.
	 *
	 * **This is what makes the replica's pull an announcing writer** rather than a silent one:
	 * derived state is computed from rows, so rows that arrived from elsewhere have to be
	 * reconciled and the query cache told. `staleTime: Infinity` with an unannounced writer is a
	 * bug — [[rules/data]], under *Query cache*, is where the enumeration is kept.
	 */
	received: boolean;
	/**
	 * the workspace the dispatch ran for, as this machine recorded it when the dispatch began;
	 * `null` where none was open.
	 *
	 * A dispatch outlives a switch between workspaces, and what it reports is about the one it
	 * started on. Startup reads this to drop a report for a workspace that is no longer open
	 * rather than reconcile the new one for rows that landed in the old.
	 */
	workspaceId: string | null;
	/**
	 * what holds this machine by its version after the dispatch, as the shell judged it, the
	 * organization's verdict and the open workspace's apart, or empty where nothing does or the
	 * dispatch threw (effort 857, requirement 9, ticket 16). Carried as it was
	 * judged rather than said as text, since what follows is a move: read-only, the switcher or the
	 * workspace-held screen, before anything else is written.
	 */
	heldByVersion: HeldByVersion[];
	/**
	 * the code of the refusal a dispatch that threw carried, or `null` where it carried none or
	 * did not throw. `errorMessage` is its sentence, for a reader; this is what startup routes on.
	 */
	refusal: string | null;
};

const REQUEST_EVENT = 'rentable:workspace-sync-request';
const RESULT_EVENT = 'rentable:workspace-sync-result';
const SESSION_ENDED_EVENT = 'rentable:session-ended';

/**
 * a dispatch found the session ended from another machine (effort 826, requirement 22).
 *
 * **Said on the window because a dispatch has three callers and one shell.** The heartbeat, the
 * sync control in the settings area and the startup pass each call the same replication, and it
 * is the replication that signs the member out on the Rust side; whichever caller it was, what
 * follows is the shell's, which reads where the machine stands and puts the wall up.
 */
export function emitSessionEnded() {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT));
}

export function listenForSessionEnded(listener: () => void) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = () => listener();

	window.addEventListener(SESSION_ENDED_EVENT, handler);
	return () => window.removeEventListener(SESSION_ENDED_EVENT, handler);
}

export function requestWorkspaceSync(detail: WorkspaceSyncRequest = {}) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent<WorkspaceSyncRequest>(REQUEST_EVENT, { detail }));
}

export function emitWorkspaceSyncResult(detail: WorkspaceSyncEventResult) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent<WorkspaceSyncEventResult>(RESULT_EVENT, { detail }));
}

export function listenForWorkspaceSyncRequests(listener: (detail: WorkspaceSyncRequest) => void) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = (event: Event) => {
		listener((event as CustomEvent<WorkspaceSyncRequest>).detail ?? {});
	};

	window.addEventListener(REQUEST_EVENT, handler as EventListener);
	return () => window.removeEventListener(REQUEST_EVENT, handler as EventListener);
}
