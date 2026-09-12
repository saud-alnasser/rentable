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
};

const REQUEST_EVENT = 'rentable:workspace-sync-request';
const RESULT_EVENT = 'rentable:workspace-sync-result';

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

export function listenForWorkspaceSyncResults(
	listener: (detail: WorkspaceSyncEventResult) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = (event: Event) => {
		listener(
			(event as CustomEvent<WorkspaceSyncEventResult>).detail ?? {
				action: 'error',
				errorMessage: null
			}
		);
	};

	window.addEventListener(RESULT_EVENT, handler as EventListener);
	return () => window.removeEventListener(RESULT_EVENT, handler as EventListener);
}
