import { tauri } from '$lib/api/tauri';
import {
	getGoogleDriveSyncErrorMessage,
	shouldRetryGoogleDriveAutosync
} from '$lib/api/utils/remote-sync-google-drive';
import {
	emitGoogleDriveAutosyncResult,
	listenForGoogleDriveAutosyncRequests,
	type GoogleDriveAutosyncRequest,
	type GoogleDriveAutosyncResult
} from '$lib/api/utils/remote-sync-google-drive-events';
import { syncWorkspaceRemoteNow } from '$lib/api/utils/workspace-sync';

const AUTOSYNC_DEBOUNCE_MS = 20_000;
const INITIAL_RETRY_MS = 15_000;
const MAX_RETRY_MS = 15 * 60_000;

export function startGoogleDriveAutosyncManager(input: {
	onResult?: (detail: GoogleDriveAutosyncResult) => Promise<void> | void;
}) {
	let timer: number | null = null;
	let isRunning = false;
	let shouldRunAgain = false;
	let retryDelayMs = INITIAL_RETRY_MS;

	const schedule = (request: GoogleDriveAutosyncRequest = {}) => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}

		timer = window.setTimeout(() => void run(), request.immediate ? 0 : AUTOSYNC_DEBOUNCE_MS);
	};

	const handleResult = async (detail: GoogleDriveAutosyncResult) => {
		emitGoogleDriveAutosyncResult(detail);
		await input.onResult?.(detail);
	};

	const run = async () => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}

		if (isRunning) {
			shouldRunAgain = true;
			return;
		}

		isRunning = true;

		try {
			const result = await syncWorkspaceRemoteNow();
			retryDelayMs = INITIAL_RETRY_MS;
			await handleResult({ action: result.action, errorMessage: null });
		} catch (error) {
			const message = getGoogleDriveSyncErrorMessage(error);
			await tauri.remoteSync.getState().catch(() => null);
			await handleResult({ action: 'error', errorMessage: message });

			if (shouldRetryGoogleDriveAutosync(error)) {
				const nextDelay = retryDelayMs;
				retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
				timer = window.setTimeout(() => void run(), nextDelay);
			}
		} finally {
			isRunning = false;

			if (shouldRunAgain) {
				shouldRunAgain = false;
				schedule({ immediate: false, reason: 'coalesced' });
			}
		}
	};

	const stopListeningForRequests = listenForGoogleDriveAutosyncRequests((detail) =>
		schedule(detail)
	);
	const handleOnline = () => schedule({ immediate: true, reason: 'online' });
	window.addEventListener('online', handleOnline);

	return () => {
		stopListeningForRequests();
		window.removeEventListener('online', handleOnline);
		if (timer !== null) {
			window.clearTimeout(timer);
		}
	};
}
