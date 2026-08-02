import { tauri } from '$lib/api/tauri';
import {
	emitGoogleDriveAutosyncResult,
	listenForGoogleDriveAutosyncRequests,
	type GoogleDriveAutosyncRequest,
	type GoogleDriveAutosyncResult
} from '$lib/api/utils/remote-sync-google-drive-events';
import { syncWorkspaceRemoteNow } from '$lib/api/utils/workspace-sync';
import { toErrorText } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

const AUTOSYNC_DEBOUNCE_MS = 20_000;
const INITIAL_RETRY_MS = 15_000;
const MAX_RETRY_MS = 15 * 60_000;

/**
 * the failures no amount of waiting settles. Each ends when someone acts, not
 * when a retry succeeds: the account has to be linked again, the file is not
 * this application's to write, the bytes disagree with what the index claims of
 * them, or another machine holds the workspace. A sync merely needing the
 * user's decision is not among them — that comes back as a preparation rather
 * than a failure, and never reaches here.
 */
const SETTLED_WITHOUT_RETRY = new Set(['preconditionFailed', 'forbidden', 'integrity', 'busy']);

function shouldRetryAfter(error: unknown) {
	const code = toTauriErrorCode(error);
	return code === null || !SETTLED_WITHOUT_RETRY.has(code);
}

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
			const message = toErrorText(error, get(LL));
			await tauri.remoteSync.getState().catch(() => null);
			await handleResult({ action: 'error', errorMessage: message });

			if (shouldRetryAfter(error)) {
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
