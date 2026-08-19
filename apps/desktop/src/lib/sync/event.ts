/**
 * asking for a dispatch, and hearing what one did.
 *
 * *Every name here said `googleDriveAutosync` until Drive sync retired (decision 07). What is
 * dispatched now is the reach at the control plane that renews this machine's window — nothing
 * is pushed and nothing is pulled — so the events are named for the workspace rather than for a
 * provider that is not there.*
 */

export type WorkspaceSyncRequest = {
	immediate?: boolean;
	reason?: string;
};

export type WorkspaceSyncEventResult = {
	/**
	 * `signInRequired` is a workspace's three-day window having closed with no contact (#550).
	 * It is listed beside `error` and is not one: nothing failed, and a retry settles it only in
	 * the sense that reaching the control plane is exactly what renews the session.
	 */
	action: 'none' | 'signInRequired' | 'error';
	errorMessage: string | null;
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
