import { tauri } from '$lib/platform/tauri';
import {
	emitWorkspaceSyncResult,
	listenForWorkspaceSyncRequests,
	type WorkspaceSyncRequest,
	type WorkspaceSyncEventResult
} from '$lib/sync/event';
import { syncWorkspaceNow } from '$lib/sync/workspace';
import { toErrorText } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

const SYNC_DEBOUNCE_MS = 20_000;
const INITIAL_RETRY_MS = 15_000;
const MAX_RETRY_MS = 15 * 60_000;

/**
 * the failures no amount of waiting settles. Each ends when someone acts, not when a retry
 * succeeds.
 *
 * *It named four Drive failures — the account needing to be linked again, a file this
 * application may not write, bytes disagreeing with the index, and another machine holding the
 * workspace. What reaches here now is the control-plane reach, and a refusal from it is
 * `preconditionFailed`: the session was declined rather than missed, and retrying against a
 * decision is how a client asks the same question forever.*
 */
const SETTLED_WITHOUT_RETRY = new Set(['preconditionFailed', 'forbidden', 'busy']);

function shouldRetryAfter(error: unknown) {
	const code = toTauriErrorCode(error);
	return code === null || !SETTLED_WITHOUT_RETRY.has(code);
}

/**
 * keep this machine's window open, on a timer and whenever the network comes back.
 *
 * **This was the Drive autosync manager and it schedules the same way**, because what it
 * schedules is the same shape: work that must be coalesced, must not overlap itself, and must
 * be retried on a widening delay while the reason for failing is one that time can settle.
 * What it dispatches is no longer a push — a replica pushes its own writes — but the reach at
 * the control plane that renews the session, which requirement 15 needs to happen without
 * anybody thinking about it.
 */
export function startWorkspaceSyncManager(input: {
	onResult?: (detail: WorkspaceSyncEventResult) => Promise<void> | void;
}) {
	let timer: number | null = null;
	let isRunning = false;
	let shouldRunAgain = false;
	let retryDelayMs = INITIAL_RETRY_MS;

	const schedule = (request: WorkspaceSyncRequest = {}) => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}

		timer = window.setTimeout(() => void run(), request.immediate ? 0 : SYNC_DEBOUNCE_MS);
	};

	const handleResult = async (detail: WorkspaceSyncEventResult) => {
		emitWorkspaceSyncResult(detail);
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
			const result = await syncWorkspaceNow();
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

	const stopListeningForRequests = listenForWorkspaceSyncRequests((detail) => schedule(detail));
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
