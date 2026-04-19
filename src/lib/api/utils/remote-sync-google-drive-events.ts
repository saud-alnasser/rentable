export type GoogleDriveAutosyncRequest = {
	immediate?: boolean;
	reason?: string;
};

export type GoogleDriveAutosyncResult = {
	action: 'none' | 'pushed' | 'pulled' | 'error';
	errorMessage: string | null;
};

const REQUEST_EVENT = 'rentable:google-drive-autosync-request';
const RESULT_EVENT = 'rentable:google-drive-autosync-result';

export function requestGoogleDriveAutosync(detail: GoogleDriveAutosyncRequest = {}) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent<GoogleDriveAutosyncRequest>(REQUEST_EVENT, { detail }));
}

export function emitGoogleDriveAutosyncResult(detail: GoogleDriveAutosyncResult) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent<GoogleDriveAutosyncResult>(RESULT_EVENT, { detail }));
}

export function listenForGoogleDriveAutosyncRequests(
	listener: (detail: GoogleDriveAutosyncRequest) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = (event: Event) => {
		listener((event as CustomEvent<GoogleDriveAutosyncRequest>).detail ?? {});
	};

	window.addEventListener(REQUEST_EVENT, handler as EventListener);
	return () => window.removeEventListener(REQUEST_EVENT, handler as EventListener);
}

export function listenForGoogleDriveAutosyncResults(
	listener: (detail: GoogleDriveAutosyncResult) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = (event: Event) => {
		listener(
			(event as CustomEvent<GoogleDriveAutosyncResult>).detail ?? {
				action: 'error',
				errorMessage: null
			}
		);
	};

	window.addEventListener(RESULT_EVENT, handler as EventListener);
	return () => window.removeEventListener(RESULT_EVENT, handler as EventListener);
}
